const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors()); 

// Phục vụ truy vấn phân tán
app.get('/api/electric-cars', async (req, res) => {
    try {
        const electricCars = await prisma.electricCar.findMany(); 
        res.status(200).json(electricCars);
    } catch (error) {
        res.status(500).json({ error: "Lỗi nội bộ tại Site 2" });
    }
});

// Thêm xe điện (Thành phần của giao dịch phân tán)
app.post('/api/electric-cars', async (req, res) => {
    try {
        const { vehicle_id, battery_capacity_kwh } = req.body;
        const newCar = await prisma.electricCar.create({
            data: { vehicle_id, battery_capacity_kwh: parseFloat(battery_capacity_kwh) }
        });
        res.status(201).json(newCar);
    } catch (error) {
        console.error("Lỗi thêm Electric Car:", error);
        res.status(500).json({ error: "Lỗi tạo Electric Car tại Site 2" });
    }
});

app.put('/api/electric-cars/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { battery_capacity_kwh } = req.body;
        const updatedCar = await prisma.electricCar.update({
            where: { vehicle_id: id },
            data: { battery_capacity_kwh: parseFloat(battery_capacity_kwh) }
        });
        res.status(200).json(updatedCar);
    } catch (error) {
        console.error("Lỗi sửa Electric Car:", error);
        res.status(500).json({ error: "Lỗi cập nhật Electric Car tại Site 2" });
    }
});

app.delete('/api/electric-cars/:id', async (req, res) => {
    try {
        await prisma.electricCar.delete({ where: { vehicle_id: req.params.id } });
        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi xóa Electric Car tại Site 2" });
    }
});

// --- SCHEMA EVOLUTION (2-PHASE COMMIT PROTOCOL) ---

// Phase 1: PREPARE
app.post('/api/schema/prepare', async (req, res) => {
    try {
        // Mô phỏng acquire lock: kiểm tra bảng tồn tại và có thể truy cập
        await prisma.$executeRawUnsafe(`LOCK TABLE "ElectricCar" IN ACCESS SHARE MODE;`);
        console.log("Schema 2PC: PREPARE -> Trả lời READY (Đã mô phỏng acquire lock)");
        res.status(200).json({ status: "READY" });
    } catch (error) {
        console.error("Schema 2PC: PREPARE -> Trả lời ABORT");
        res.status(500).json({ status: "NOT_READY" });
    }
});

// Phase 2: COMMIT
app.post('/api/schema/commit', async (req, res) => {
    try {
        console.log("Schema 2PC: COMMIT -> Thực hiện ALTER TABLE");
        await prisma.$executeRawUnsafe(`ALTER TABLE "ElectricCar" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);
        res.status(200).json({ message: "Đã cập nhật cấu trúc tại Site 2 (Electric Car)" });
    } catch (error) {
        console.error("Schema 2PC: COMMIT -> Xảy ra lỗi", error);
        res.status(500).json({ error: "Lỗi Alter Table" });
    }
});

// ABORT PHASE: Dùng để rollback nếu có Site khác fail
app.post('/api/schema/abort', async (req, res) => {
    try {
        console.log("Schema 2PC: ABORT -> Rollback ALTER TABLE");
        await prisma.$executeRawUnsafe(`ALTER TABLE "ElectricCar" DROP COLUMN IF EXISTS "color";`);
        res.status(200).json({ message: "Đã rollback cột color tại Site 2" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi Rollback Alter Table" });
    }
});

app.listen(3002, () => console.log('🚀 Site 2 (Electric Car) chạy tại port 3002'));