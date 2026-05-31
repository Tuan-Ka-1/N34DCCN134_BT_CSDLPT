// site0-coordinator/server.js
const express = require('express');
const axios = require('axios'); // Thư viện dùng để gọi API sang các Node khác
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// API: Truy vấn Đa hình (Polymorphic Search)
app.get('/api/vehicles', async (req, res) => {
    try {
        // 1. Lấy dữ liệu lớp cha (Vehicle) từ Database cục bộ của Site 0
        const baseVehicles = await prisma.vehicle.findMany();

        // 2. Gọi API song song xuống Site 1 và Site 2
        // Dùng Promise.all để gọi cùng lúc, giúp tối ưu thời gian phản hồi mạng
        const [trucksRes, electricCarsRes] = await Promise.all([
            axios.get('http://localhost:3001/api/trucks').catch(err => {
                console.log("⚠️ Site 1 (Truck) không phản hồi!");
                return { data: [] }; // Mô phỏng kịch bản lỗi: Trả về mảng rỗng nếu sập
            }),
            axios.get('http://localhost:3002/api/electric-cars').catch(err => {
                console.log("⚠️ Site 2 (Electric Car) không phản hồi!");
                return { data: [] }; 
            })
        ]);

        const trucks = trucksRes.data;
        const electricCars = electricCarsRes.data;

        // 3. Gom nhóm dữ liệu (In-memory Join) dựa trên OID (id)
        const polymorphicResult = baseVehicles.map(vehicle => {
            let specializedData = {};

            if (vehicle.type === 'Truck') {
                // Tìm xe tải bên Site 1 có mã vehicle_id khớp với id của xe ở Site 0
                specializedData = trucks.find(t => t.vehicle_id === vehicle.id) || { status: 'Data unavailable' };
            } 
            else if (vehicle.type === 'ElectricCar') {
                // Tìm xe điện bên Site 2
                specializedData = electricCars.find(e => e.vehicle_id === vehicle.id) || { status: 'Data unavailable' };
            }

            // Gộp thông tin của xe cơ bản và thông tin riêng lẻ thành 1 object hoàn chỉnh
            return {
                ...vehicle,
                ...specializedData
            };
        });

        // 4. Trả kết quả cuối cùng cho Client
        res.status(200).json({
            total_count: polymorphicResult.length,
            data: polymorphicResult
        });

    } catch (error) {
        console.error("Lỗi Global Query:", error);
        res.status(500).json({ error: "Lỗi thực thi truy vấn phân tán" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Site 0 (Coordinator) đang chạy tại: http://localhost:${PORT}`);
});