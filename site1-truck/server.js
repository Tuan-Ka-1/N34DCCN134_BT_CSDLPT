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

app.listen(3001, () => console.log('🚀 Site 1 (Truck) chạy tại port 3001'));