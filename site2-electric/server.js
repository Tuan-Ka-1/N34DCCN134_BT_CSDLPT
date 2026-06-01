const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors()); 

app.get('/api/electric-cars', async (req, res) => {
    try {
        const electricCars = await prisma.electricCar.findMany(); 
        res.status(200).json(electricCars);
    } catch (error) {
        res.status(500).json({ error: "Lỗi nội bộ tại Site 2" });
    }
});

// Thêm vào site2-electric/server.js
app.get('/api/add-column', async (req, res) => {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "ElectricCar" ADD COLUMN IF NOT EXISTS "color" VARCHAR(50);`);
        res.status(200).json({ message: "Đã cập nhật cấu trúc tại Site 2 (Electric Car)" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Lỗi cập nhật cấu trúc Site 2" });
    }
});

// THÊM API POST (Tạo xe điện mới)
app.post('/api/electric-cars', async (req, res) => {
    try {
        const { vehicle_id, battery_capacity_kwh } = req.body;
        const newCar = await prisma.electricCar.create({
            data: {
                vehicle_id,
                battery_capacity_kwh: parseFloat(battery_capacity_kwh)
            }
        });
        res.status(201).json(newCar);
    } catch (error) {
        console.error("Lỗi thêm Electric Car:", error);
        res.status(500).json({ error: "Lỗi tạo Electric Car tại Site 2" });
    }
});

// THÊM API DELETE (Xóa xe điện)
app.delete('/api/electric-cars/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.electricCar.delete({
            where: { vehicle_id: id }
        });
        res.status(200).json({ message: "Xóa thành công" });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Không tìm thấy Electric Car để xóa" });
        }
        console.error("Lỗi xóa Electric Car:", error);
        res.status(500).json({ error: "Lỗi xóa Electric Car tại Site 2" });
    }
});

// THÊM API PUT (Sửa xe điện)
app.put('/api/electric-cars/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { battery_capacity_kwh } = req.body;
        const updatedCar = await prisma.electricCar.update({
            where: { vehicle_id: id },
            data: {
                battery_capacity_kwh: parseFloat(battery_capacity_kwh)
            }
        });
        res.status(200).json(updatedCar);
    } catch (error) {
        console.error("Lỗi sửa Electric Car:", error);
        res.status(500).json({ error: "Lỗi cập nhật Electric Car tại Site 2" });
    }
});

app.listen(3002, () => console.log('🚀 Site 2 (Electric Car) chạy tại port 3002'));