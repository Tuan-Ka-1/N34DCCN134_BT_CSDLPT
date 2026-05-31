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

app.listen(3001, () => console.log('🚀 Site 1 (Truck) chạy tại port 3001'));