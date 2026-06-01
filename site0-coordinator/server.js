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

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Lấy URL từ biến môi trường
const SITE1 = process.env.SITE1_URL || 'http://localhost:3001';
const SITE2 = process.env.SITE2_URL || 'http://localhost:3002';

// API: Truy vấn Đa hình (Polymorphic Search) - Đã có Performance metrics
app.get('/api/vehicles', async (req, res) => {
    const startTotalTime = Date.now();
    try {
        const startDbTime = Date.now();
        const baseVehicles = await prisma.vehicle.findMany();
        const db_fetch_ms = Date.now() - startDbTime;

        const startNetworkTime = Date.now();
        const [trucksRes, electricCarsRes] = await Promise.all([
            axios.get(`${SITE1}/api/trucks`).catch(() => null),
            axios.get(`${SITE2}/api/electric-cars`).catch(() => null)
        ]);
        const network_fetch_ms = Date.now() - startNetworkTime;

        const trucks = trucksRes ? trucksRes.data : [];
        const electricCars = electricCarsRes ? electricCarsRes.data : [];

        // Trạng thái Node
        const node_status = [
            { site: 'Site 1 (Truck)', online: trucksRes !== null },
            { site: 'Site 2 (Electric Car)', online: electricCarsRes !== null }
        ];

        const truckMap = new Map(trucks.map(t => [t.vehicle_id, t]));
        const electricCarMap = new Map(electricCars.map(e => [e.vehicle_id, e]));

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

        const total_ms = Date.now() - startTotalTime;

        res.status(200).json({
            performance: { db_fetch_ms, network_fetch_ms, total_ms },
            node_status,
            total_count: polymorphicResult.length,
            data: polymorphicResult
        });

    } catch (error) {
        console.error("Lỗi Global Query:", error);
        res.status(500).json({ error: "Lỗi thực thi truy vấn phân tán" });
    }
});

// API: Tạo xe mới (Thêm vào cả gốc và phân mảnh)
app.post('/api/vehicles', async (req, res) => {
    try {
        const { type, brand, year, color, load_capacity_tons, battery_capacity_kwh } = req.body;
        const vehicle_id = uuidv4(); // Sinh OID

        // 1. Lưu thông tin chung ở Site 0 bằng Prisma ORM (Bám sát kiến trúc đề ra)
        const vehicleData = { id: vehicle_id, type, brand, year: parseInt(year) };
        // Chỉ truyền color nếu có dữ liệu, giúp Prisma không báo lỗi khi schema chưa có cột này
        if (color && color.trim() !== "") {
            vehicleData.color = color;
        }

        const newVehicle = await prisma.vehicle.create({
            data: vehicleData
        });

        // 2. Gọi Axios lưu phân mảnh
        if (type === 'Truck') {
            await axios.post(`${SITE1}/api/trucks`, { vehicle_id, load_capacity_tons });
        } else if (type === 'ElectricCar') {
            await axios.post(`${SITE2}/api/electric-cars`, { vehicle_id, battery_capacity_kwh });
        }

        res.status(201).json({ message: "Tạo thành công", vehicle: newVehicle });
    } catch (error) {
        console.error("Lỗi tạo Vehicle:", error);
        res.status(500).json({ error: "Lỗi thêm xe phân tán" });
    }
});

// API: Xóa xe (Xóa cả gốc và nhánh con)
app.delete('/api/vehicles/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Xóa ở Site 0
        await prisma.vehicle.delete({ where: { id } });

        // 2. Cố gắng xóa ở các site nhánh (Không làm crash vòng ngoài nếu site nhánh lỗi)
        await Promise.all([
            axios.delete(`${SITE1}/api/trucks/${id}`).catch(() => console.log('Bỏ qua xóa Truck (Site 1)')),
            axios.delete(`${SITE2}/api/electric-cars/${id}`).catch(() => console.log('Bỏ qua xóa ElectricCar (Site 2)'))
        ]);

        res.status(200).json({ message: "Xóa thành công trên mạng lưới" });
    } catch (error) {
        console.error("Lỗi xóa Vehicle:", error);
        res.status(500).json({ error: "Lỗi xóa xe phân tán" });
    }
});

// API: Sửa thông tin xe
app.put('/api/vehicles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, brand, year, color, load_capacity_tons, battery_capacity_kwh } = req.body;

        // 1. Cập nhật thông tin chung ở Site 0 bằng Prisma ORM
        const updateData = { brand, year: parseInt(year) };
        if (color && color.trim() !== "") {
            updateData.color = color;
        }

        const updatedVehicle = await prisma.vehicle.update({
            where: { id },
            data: updateData
        });

        // 2. Gọi Axios cập nhật phân mảnh (dựa vào type hiện tại)
        if (type === 'Truck') {
            await axios.put(`${SITE1}/api/trucks/${id}`, { load_capacity_tons });
        } else if (type === 'ElectricCar') {
            await axios.put(`${SITE2}/api/electric-cars/${id}`, { battery_capacity_kwh });
        }

        res.status(200).json({ message: "Cập nhật thành công", vehicle: updatedVehicle });
    } catch (error) {
        console.error("Lỗi sửa Vehicle:", error);
        res.status(500).json({ error: "Lỗi cập nhật xe phân tán" });
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