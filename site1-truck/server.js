const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors()); 

app.get('/api/trucks', async (req, res) => {
    try {
        const trucks = await prisma.truck.findMany(); 
        res.status(200).json(trucks);
    } catch (error) {
        res.status(500).json({ error: "Lỗi nội bộ tại Site 1" });
    }
});

app.get('/api/add-column', async (req, res) => {
    try {
        // Dùng lệnh SQL thô để ép thêm cột 'color' vào bảng
        await prisma.$executeRawUnsafe(`ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);
        res.status(200).json({ message: "Đã cập nhật cấu trúc tại Site 1 (Truck)" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Lỗi cập nhật cấu trúc Site 1" });
    }
});

// THÊM API POST (Tạo xe tải mới)
app.post('/api/trucks', async (req, res) => {
    try {
        const { vehicle_id, load_capacity_tons } = req.body;
        const newTruck = await prisma.truck.create({
            data: {
                vehicle_id,
                load_capacity_tons: parseFloat(load_capacity_tons)
            }
        });
        res.status(201).json(newTruck);
    } catch (error) {
        console.error("Lỗi thêm Truck:", error);
        res.status(500).json({ error: "Lỗi tạo Truck tại Site 1" });
    }
});

// THÊM API DELETE (Xóa xe tải)
app.delete('/api/trucks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.truck.delete({
            where: { vehicle_id: id }
        });
        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Không tìm thấy Truck để xóa" });
        }
        console.error("Lỗi xóa Truck:", error);
        res.status(500).json({ error: "Lỗi xóa Truck tại Site 1" });
    }
});

// THÊM API PUT (Sửa xe tải)
app.put('/api/trucks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { load_capacity_tons } = req.body;
        const updatedTruck = await prisma.truck.update({
            where: { vehicle_id: id },
            data: {
                load_capacity_tons: parseFloat(load_capacity_tons)
            }
        });
        res.status(200).json(updatedTruck);
    } catch (error) {
        console.error("Lỗi sửa Truck:", error);
        res.status(500).json({ error: "Lỗi cập nhật Truck tại Site 1" });
    }
});

app.listen(3001, () => console.log('🚀 Site 1 (Truck) chạy tại port 3001'));