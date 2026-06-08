const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors()); 

// Phục vụ truy vấn phân tán
app.get('/api/trucks', async (req, res) => {
    try {
        const trucks = await prisma.truck.findMany(); 
        res.status(200).json(trucks);
    } catch (error) {
        res.status(500).json({ error: "Lỗi nội bộ tại Site 1" });
    }
});

// Thêm xe tải (Thành phần của giao dịch phân tán)
app.post('/api/trucks', async (req, res) => {
    try {
        const { vehicle_id, load_capacity_tons } = req.body;
        const newTruck = await prisma.truck.create({
            data: { vehicle_id, load_capacity_tons: parseFloat(load_capacity_tons) }
        });
        res.status(201).json(newTruck);
    } catch (error) {
        console.error("Lỗi thêm Truck:", error);
        res.status(500).json({ error: "Lỗi tạo Truck tại Site 1" });
    }
});

app.put('/api/trucks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { load_capacity_tons } = req.body;
        const updatedTruck = await prisma.truck.update({
            where: { vehicle_id: id },
            data: { load_capacity_tons: parseFloat(load_capacity_tons) }
        });
        res.status(200).json(updatedTruck);
    } catch (error) {
        res.status(500).json({ error: "Lỗi cập nhật Truck tại Site 1" });
    }
});

app.delete('/api/trucks/:id', async (req, res) => {
    try {
        await prisma.truck.delete({ where: { vehicle_id: req.params.id } });
        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi xóa Truck" });
    }
});

// --- SCHEMA EVOLUTION (2-PHASE COMMIT PROTOCOL) ---

// Phase 1: PREPARE
app.post('/api/schema/prepare', async (req, res) => {
    try {
        // Mô phỏng acquire lock: kiểm tra bảng tồn tại và có thể truy cập
        await prisma.$executeRawUnsafe(`LOCK TABLE "Truck" IN ACCESS SHARE MODE;`);
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
        await prisma.$executeRawUnsafe(`ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);
        res.status(200).json({ message: "Đã thêm cột color tại Site 1" });
    } catch (error) {
        console.error("Schema 2PC: COMMIT -> Xảy ra lỗi", error);
        res.status(500).json({ error: "Lỗi Alter Table" });
    }
});

// ABORT PHASE: Dùng để rollback nếu có Site khác fail
app.post('/api/schema/abort', async (req, res) => {
    try {
        console.log("Schema 2PC: ABORT -> Rollback ALTER TABLE");
        await prisma.$executeRawUnsafe(`ALTER TABLE "Truck" DROP COLUMN IF EXISTS "color";`);
        res.status(200).json({ message: "Đã rollback cột color tại Site 1" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi Rollback Alter Table" });
    }
});

app.listen(3001, () => console.log('🚀 Site 1 (Truck) chạy tại port 3001'));