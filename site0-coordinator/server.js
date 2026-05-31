// site0-coordinator/server.js
const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// Lấy URL từ biến môi trường (Hoặc dùng default nếu quên cấu hình)
const SITE1 = process.env.SITE1_URL || 'http://localhost:3001';
const SITE2 = process.env.SITE2_URL || 'http://localhost:3002';

// API: Truy vấn Đa hình (Polymorphic Search) - Đã tối ưu hiệu năng
app.get('/api/vehicles', async (req, res) => {
    try {
        const baseVehicles = await prisma.vehicle.findMany();

        const [trucksRes, electricCarsRes] = await Promise.all([
            axios.get(`${SITE1}/api/trucks`).catch(() => ({ data: [] })),
            axios.get(`${SITE2}/api/electric-cars`).catch(() => ({ data: [] }))
        ]);

        const trucks = trucksRes.data;
        const electricCars = electricCarsRes.data;

        // TỐI ƯU HÓA: Chuyển đổi mảng thành Hash Map để tra cứu O(1)
        const truckMap = new Map(trucks.map(t => [t.vehicle_id, t]));
        const electricCarMap = new Map(electricCars.map(e => [e.vehicle_id, e]));

        // Gom nhóm dữ liệu cực nhanh
        const polymorphicResult = baseVehicles.map(vehicle => {
            let specializedData = {};

            if (vehicle.type === 'Truck') {
                specializedData = truckMap.get(vehicle.id) || { status: 'Data unavailable' };
            } 
            else if (vehicle.type === 'ElectricCar') {
                specializedData = electricCarMap.get(vehicle.id) || { status: 'Data unavailable' };
            }

            return {
                ...vehicle,
                ...specializedData
            };
        });

        res.status(200).json({
            total_count: polymorphicResult.length,
            data: polymorphicResult
        });

    } catch (error) {
        console.error("Lỗi Global Query:", error);
        res.status(500).json({ error: "Lỗi thực thi truy vấn phân tán" });
    }
});

// API: Schema Evolution
app.get('/api/evolve-schema', async (req, res) => {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);

        await Promise.all([
            axios.get(`${SITE1}/api/add-column`).catch(e => console.log("Site 1 error")),
            axios.get(`${SITE2}/api/add-column`).catch(e => console.log("Site 2 error"))
        ]);

        res.status(200).json({ 
            status: "Thành công",
            message: "Schema Evolution đã được đồng bộ!" 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Lỗi đồng bộ cấu trúc mạng" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Site 0 (Coordinator) đang chạy tại: http://localhost:${PORT}`);
});