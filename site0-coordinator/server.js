// site0-coordinator/server.js
const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const SITE1 = process.env.SITE1_URL || 'http://localhost:3001';
const SITE2 = process.env.SITE2_URL || 'http://localhost:3002';

// 1. TÌM KIẾM ĐA HÌNH (Polymorphic Search)
app.get('/api/vehicles', async (req, res) => {
    // Chế độ Nhất quán cao (Strict mode): Nếu 1 node sập, từ chối toàn bộ truy vấn
    const isStrict = req.query.strict === 'true'; 
    const startTotalTime = Date.now();

    try {
        const baseVehicles = await prisma.vehicle.findMany();

        // Gửi truy vấn đồng thời tới các Node con (Scatter)
        const [trucksRes, electricCarsRes] = await Promise.all([
            axios.get(`${SITE1}/api/trucks`).catch(e => {
                if (isStrict) throw new Error('Site 1 (Truck) is down');
                return null;
            }),
            axios.get(`${SITE2}/api/electric-cars`).catch(e => {
                if (isStrict) throw new Error('Site 2 (ElectricCar) is down');
                return null;
            })
        ]);

        const trucks = trucksRes ? trucksRes.data : [];
        const electricCars = electricCarsRes ? electricCarsRes.data : [];

        const truckMap = new Map(trucks.map(t => [t.vehicle_id, t]));
        const electricCarMap = new Map(electricCars.map(e => [e.vehicle_id, e]));

        // Phép Kết nối Phân tán (Distributed Join) - (Gather)
        const polymorphicResult = baseVehicles.map(vehicle => {
            let specializedData = {};
            if (vehicle.type === 'Truck') {
                specializedData = truckMap.get(vehicle.id) || { status: 'Data unavailable' };
            } else if (vehicle.type === 'ElectricCar') {
                specializedData = electricCarMap.get(vehicle.id) || { status: 'Data unavailable' };
            }
            return { ...vehicle, ...specializedData };
        });

        res.status(200).json({
            node_status: [
                { site: 'Site 1 (Truck)', online: trucksRes !== null },
                { site: 'Site 2 (Electric Car)', online: electricCarsRes !== null }
            ],
            total_count: polymorphicResult.length,
            data: polymorphicResult,
            total_ms: Date.now() - startTotalTime
        });

    } catch (error) {
        console.error("Lỗi Global Query:", error.message);
        // Ưu tiên Consistency: Trả về lỗi 503 nếu có node lỗi trong chế độ Strict
        res.status(503).json({ error: "Lỗi truy vấn phân tán: " + error.message });
    }
});

// 2. GIAO DỊCH PHÂN TÁN (Compensating Transaction / Saga Pattern)
app.post('/api/vehicles', async (req, res) => {
    const { type, brand, year, color, load_capacity_tons, battery_capacity_kwh } = req.body;
    const vehicle_id = uuidv4();

    let newVehicle = null;

    try {
        // Bước 1: Ghi vào Site 0 (Coordinator)
        const vehicleData = { id: vehicle_id, type, brand, year: parseInt(year) };
        if (color) vehicleData.color = color;
        newVehicle = await prisma.vehicle.create({ data: vehicleData });

        // Bước 2: Ghi vào Site nhánh
        if (type === 'Truck') {
            await axios.post(`${SITE1}/api/trucks`, { vehicle_id, load_capacity_tons });
        } else if (type === 'ElectricCar') {
            await axios.post(`${SITE2}/api/electric-cars`, { vehicle_id, battery_capacity_kwh });
        }

        res.status(201).json({ message: "Tạo thành công", vehicle: newVehicle });
    } catch (error) {
        console.error("Lỗi phân tán, tiến hành Rollback...");
        // Rollback: Xóa bản ghi ở Site 0 nếu ghi vào Site nhánh bị lỗi
        if (newVehicle) {
            await prisma.vehicle.delete({ where: { id: vehicle_id } }).catch(e => console.error("Lỗi Rollback!", e));
        }
        res.status(500).json({ error: "Giao dịch thất bại, đã Rollback để giữ an toàn dữ liệu." });
    }
});

app.put('/api/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    const { type, brand, year, color, load_capacity_tons, battery_capacity_kwh } = req.body;

    let oldVehicle = null;
    try {
        // Lưu lại trạng thái cũ để chuẩn bị Rollback nếu có biến
        oldVehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!oldVehicle) return res.status(404).json({ error: "Không tìm thấy" });

        // Cập nhật Site 0
        const updateData = { brand, year: parseInt(year) };
        if (color) updateData.color = color;
        const updatedVehicle = await prisma.vehicle.update({ where: { id }, data: updateData });

        // Cập nhật Site nhánh
        if (type === 'Truck') {
            await axios.put(`${SITE1}/api/trucks/${id}`, { load_capacity_tons });
        } else if (type === 'ElectricCar') {
            await axios.put(`${SITE2}/api/electric-cars/${id}`, { battery_capacity_kwh });
        }

        res.status(200).json({ message: "Cập nhật thành công", vehicle: updatedVehicle });
    } catch (error) {
        console.error("Lỗi phân tán, tiến hành Rollback Update...");
        // Rollback: Trả lại dữ liệu cũ cho Site 0
        if (oldVehicle) {
            await prisma.vehicle.update({ where: { id }, data: oldVehicle }).catch(e => console.error("Lỗi Rollback!", e));
        }
        res.status(500).json({ error: "Cập nhật thất bại, đã Rollback." });
    }
});

app.delete('/api/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    let oldVehicle = null;
    try {
        // 1. Lấy thông tin vehicle gốc để biết type và lưu backup rollback
        oldVehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!oldVehicle) return res.status(404).json({ error: "Không tìm thấy" });

        // 2. Xóa ở Coordinator (Site 0) trước
        await prisma.vehicle.delete({ where: { id } });

        // 3. Xóa ở Site nhánh tương ứng
        if (oldVehicle.type === 'Truck') {
            await axios.delete(`${SITE1}/api/trucks/${id}`);
        } else if (oldVehicle.type === 'ElectricCar') {
            await axios.delete(`${SITE2}/api/electric-cars/${id}`);
        }

        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        console.error("Lỗi xóa phân tán, tiến hành Rollback...");
        // Rollback: Phục hồi lại dữ liệu ở Site 0 nếu xóa Site nhánh thất bại
        if (oldVehicle) {
            await prisma.vehicle.create({ data: oldVehicle }).catch(e => console.error("Lỗi Rollback DELETE!", e));
        }
        res.status(500).json({ error: "Xóa thất bại, đã Rollback." });
    }
});

// 3. TIẾN HÓA LƯỢC ĐỒ (Distributed Schema Evolution) theo Giao thức 2 Pha (2PC)
app.post('/api/schema/evolve', async (req, res) => {
    try {
        // PHASE 1: PREPARE (Hỏi các site con có sẵn sàng không)
        console.log("2PC - Phase 1: PREPARE");
        await Promise.all([
            axios.post(`${SITE1}/api/schema/prepare`, {}, { timeout: 5000 }),
            axios.post(`${SITE2}/api/schema/prepare`, {}, { timeout: 5000 })
        ]);

        // Nếu qua được Phase 1, tiến hành Phase 2
        console.log("2PC - Phase 2: COMMIT");
        
        try {
            // Ra lệnh các Site con chạy COMMIT trước
            await Promise.all([
                axios.post(`${SITE1}/api/schema/commit`, {}, { timeout: 5000 }),
                axios.post(`${SITE2}/api/schema/commit`, {}, { timeout: 5000 })
            ]);

            // Chạy nội bộ Site 0
            await prisma.$executeRawUnsafe(`ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);
            
            res.status(200).json({ message: "Schema Evolution (2PC) thành công!" });
        } catch (commitError) {
            console.error("2PC - COMMIT FAIL: Một Node lỗi lúc commit, tiến hành ABORT (Rollback DDL)");
            // ABORT PHASE: Rollback DDL
            await axios.post(`${SITE1}/api/schema/abort`).catch(()=>null);
            await axios.post(`${SITE2}/api/schema/abort`).catch(()=>null);
            await prisma.$executeRawUnsafe(`ALTER TABLE "Vehicle" DROP COLUMN IF EXISTS "color";`).catch(()=>null);
            
            res.status(500).json({ error: "2PC Abort: Commit thất bại, đã rollback schema trên toàn hệ thống." });
        }
    } catch (error) {
        // Nếu Phase 1 có Node báo lỗi (Ví dụ Timeout), tiến hành ABORT Phase 1
        console.error("2PC - ABORT: Một hoặc nhiều node không sẵn sàng Phase 1.");
        res.status(500).json({ error: "2PC Abort: Không thể prepare, có node gặp sự cố." });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Site 0 (Coordinator) đang chạy tại: http://localhost:${PORT}`);
});