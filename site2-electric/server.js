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

app.listen(3002, () => console.log('🚀 Site 2 (Electric Car) chạy tại port 3002'));