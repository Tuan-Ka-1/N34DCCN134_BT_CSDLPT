# Phân tích: Kế thừa phân tán & Tiến hóa lược đồ

**Dự án:** 89. Xử lý kế thừa phân tán: "Đội xe" (Vehicle Fleet)
**Lý thuyết tham chiếu:** Nguyên lý Hệ Cơ Sở Dữ Liệu Phân Tán của M. Tamer Özsu và Patrick Valduriez.

## 1. Quản lý Định danh Đối tượng (OID)
Trong quản lý đối tượng phân tán, việc duy trì một Định danh Đối tượng (OID) nhất quán trên các trạm (sites) là rất quan trọng (Özsu & Valduriez, Chương 15). Không giống như phân mảnh quan hệ thuần túy nơi các khóa chính có thể được cục bộ hóa, kế thừa phân tán yêu cầu OID hoạt động như một con trỏ toàn cục (universal pointer). 
Trong hệ thống "Đội xe" của chúng tôi, chúng tôi sử dụng **UUIDv4** được tạo tại Trạm điều phối (Site 0) trong quá trình tạo đối tượng. UUID này đóng vai trò là khóa chính (`id`) trong bảng cơ sở `Vehicle` và hoạt động như khóa ngoại (`vehicle_id`) trong các bảng chuyên biệt (`Truck` tại Site 1, `ElectricCar` tại Site 2). Điều này đảm bảo **Tính trong suốt về vị trí (Location Transparency)** và **Tính trong suốt về phân mảnh (Fragmentation Transparency)**; ứng dụng có thể yêu cầu một đối tượng bằng OID của nó và trạm điều phối xử lý việc "Tái tạo đối tượng" (Object Rehydration) bằng cách thu thập các mảnh dữ liệu mà máy khách không cần biết dữ liệu nằm ở đâu về mặt vật lý.

## 2. Xử lý độ phức tạp: Tìm kiếm đa hình (Polymorphic Search)
Việc truy xuất một đối tượng hoàn chỉnh trong mô hình kế thừa phân tán yêu cầu phải tái cấu trúc đối tượng từ lớp cơ sở (base class) và các mảnh của lớp con (subclass fragments).
Hệ thống của chúng tôi triển khai tính năng "Tìm kiếm đa hình" (Polymorphic Search) trong đó Trạm điều phối trước tiên tìm nạp tất cả các thể hiện của lớp cơ sở, sau đó đồng thời lấy tất cả các mảnh của lớp con từ Site 1 và Site 2. Để tối ưu hóa "Chi phí tái tạo đối tượng", chúng tôi đã triển khai thuật toán **In-Memory Hash Join** (độ phức tạp $O(N)$ thay vì $O(N \times M)$). Bằng cách tìm nạp các mảnh lớp con song song thông qua các lệnh gọi mạng bất đồng bộ (`Promise.all`), chúng tôi giảm thiểu thời gian phản hồi tổng thể, đánh đổi thành công một phần băng thông mạng để lấy tính song song cao và độ trễ thấp.

## 3. Vấn đề Tiến hóa Lược đồ (Schema Evolution)
Tiến hóa lược đồ trong cơ sở dữ liệu phân tán là một thách thức phức tạp vì việc thay đổi định nghĩa lớp (ví dụ: thêm một thuộc tính vào `Vehicle`) đòi hỏi phải truyền tải thay đổi đó đến tất cả các lớp con phân tán để duy trì tính nhất quán của lược đồ.

Theo Özsu và Valduriez, thường có hai cách tiếp cận để cập nhật lược đồ:
- **Cập nhật tức thời (Đồng bộ - Eager Update):** Thay đổi lược đồ ngay lập tức được phát đến tất cả các node. Hệ thống bị chặn cho đến khi tất cả các node xác nhận thay đổi về cấu trúc.
- **Cập nhật lười biếng (Bất đồng bộ/Đánh phiên bản - Lazy Update):** Các đối tượng được phép tồn tại ở nhiều phiên bản lược đồ khác nhau và hệ thống xử lý sự khác biệt trong các thao tác đọc (thường sử dụng ID phiên bản lược đồ).

**Quá trình triển khai của chúng tôi:**
Chúng tôi đã triển khai cơ chế **Cập nhật tức thời (Eager Update)**. Khi endpoint `/api/evolve-schema` được kích hoạt, Trạm điều phối sẽ sửa đổi lược đồ cục bộ của nó (thêm thuộc tính `color`) bằng cách sử dụng SQL thô (`ALTER TABLE`). Sau đó, nó ngay lập tức điều phối các request đến Site 1 và Site 2 để thực thi các sửa đổi lược đồ tương ứng của chúng. Điều này đảm bảo **Tính nhất quán nghiêm ngặt (Strict Consistency)** trên toàn cụm. Nếu một thuộc tính mới được thêm vào lớp cha, tất cả các node làm việc (worker nodes) ngay lập tức nhận biết và sẵn sàng về mặt cấu trúc để lưu trữ thuộc tính được kế thừa.

## 4. Khả năng chịu lỗi (Fault Tolerance) & Nhận thức mạng (Network Awareness)
Các truy vấn phân tán rất dễ bị lỗi một phần (partial failures). Nếu Site 1 gặp sự cố, quá trình kết nối (join) tức thời sẽ khiến toàn bộ truy vấn toàn cục bị lỗi. Chúng tôi giảm thiểu rủi ro này bằng cách sử dụng phương pháp fail-soft (giảm thiểu lỗi). Nếu một node con bị timeout hoặc từ chối kết nối, Trạm điều phối sẽ bắt lỗi và trả về đối tượng cơ sở với cờ chuyên biệt `status: "Data unavailable"`. Điều này đảm bảo hệ thống duy trì tính Khả dụng (Availability) cao đối với các phân vùng khỏe mạnh (ví dụ: Xe điện) ngay cả khi phân vùng Xe tải bị ngắt kết nối. Hơn nữa, hệ thống còn đo lường và hiển thị chính xác thời gian `network_fetch_ms` so với `db_fetch_ms` để cung cấp khả năng quan sát toàn diện về chi phí tái tạo đối tượng xuyên suốt các trạm phân tán.

## 5. Kết quả Thực nghiệm (Empirical Proofs)
*Phần này dùng để chứng minh các biện luận lý thuyết ở trên bằng kết quả chạy thực tế.*

### 5.1. So sánh chi phí tải dữ liệu (Network vs Database)
*(Ảnh chụp console hoặc màn hình dashboard chứng minh `db_fetch_ms` và `network_fetch_ms`)*
![Performance Benchmark](./performance_benchmark.png)
> **Biện luận:** Như có thể thấy từ kết quả, nhờ áp dụng In-Memory Hash Join và Promise.all, độ trễ truy xuất qua mạng (Network Fetch) được kiểm soát ở mức cho phép, không gây tắc nghẽn (bottleneck) đáng kể so với việc truy xuất DB cục bộ.

### 5.2. Kịch bản Đứt gãy phân vùng (Partition Failure)
*(Ảnh chụp màn hình khi Site 1 tắt, trả về lỗi Data Unavailable nhưng danh sách xe vẫn load được)*
![Fault Tolerance Demo](./fault_tolerance.png)
> **Biện luận:** Việc xử lý lỗi mượt mà (Graceful Degradation) đã giúp duy trì tính Khả dụng (Availability) trong định lý CAP, đánh đổi một phần tính Toàn vẹn dữ liệu (chấp nhận thiếu thông tin tải trọng của Xe tải) thay vì làm sập toàn bộ hệ thống.
