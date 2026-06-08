const axios = require('axios');

const SITE0_URL = 'http://localhost:3000/api/vehicles';

const seedData = [
    // Xe Tải (Trucks)
    { type: 'Truck', brand: 'Volvo FH16', year: 2022, load_capacity_tons: 25 },
    { type: 'Truck', brand: 'Hyundai HD240', year: 2021, load_capacity_tons: 15 },
    { type: 'Truck', brand: 'Isuzu NPR85K', year: 2020, load_capacity_tons: 5.5 },
    { type: 'Truck', brand: 'Hino 500 Series', year: 2023, load_capacity_tons: 16 },
    { type: 'Truck', brand: 'Scania R500', year: 2021, load_capacity_tons: 30 },
    { type: 'Truck', brand: 'MAN TGX', year: 2019, load_capacity_tons: 22 },
    { type: 'Truck', brand: 'Mitsubishi Fuso', year: 2022, load_capacity_tons: 8 },
    { type: 'Truck', brand: 'Kenworth T680', year: 2023, load_capacity_tons: 40 },
    { type: 'Truck', brand: 'Peterbilt 389', year: 2021, load_capacity_tons: 36 },
    { type: 'Truck', brand: 'Thaco Auman', year: 2020, load_capacity_tons: 14 },
    
    // Xe Điện (Electric Cars)
    { type: 'ElectricCar', brand: 'Tesla Model Y', year: 2023, battery_capacity_kwh: 75 },
    { type: 'ElectricCar', brand: 'VinFast VF8', year: 2024, battery_capacity_kwh: 87.7 },
    { type: 'ElectricCar', brand: 'Porsche Taycan', year: 2022, battery_capacity_kwh: 93.4 },
    { type: 'ElectricCar', brand: 'Audi e-tron GT', year: 2023, battery_capacity_kwh: 85 },
    { type: 'ElectricCar', brand: 'Hyundai Ioniq 5', year: 2022, battery_capacity_kwh: 77.4 },
    { type: 'ElectricCar', brand: 'Kia EV6', year: 2023, battery_capacity_kwh: 77.4 },
    { type: 'ElectricCar', brand: 'BMW i4', year: 2024, battery_capacity_kwh: 83.9 },
    { type: 'ElectricCar', brand: 'Mercedes EQE', year: 2023, battery_capacity_kwh: 90.6 },
    { type: 'ElectricCar', brand: 'VinFast VF9', year: 2024, battery_capacity_kwh: 123 },
    { type: 'ElectricCar', brand: 'Ford Mustang Mach-E', year: 2021, battery_capacity_kwh: 88 }
];

async function seed() {
    console.log("🌱 Đang bắt đầu bơm dữ liệu phân tán (Seeding)...");
    let successCount = 0;
    
    for (const vehicle of seedData) {
        try {
            const res = await axios.post(SITE0_URL, vehicle);
            console.log(`✅ Đã thêm: [${vehicle.type}] ${vehicle.brand} (OID: ${res.data.vehicle.id})`);
            successCount++;
        } catch (error) {
            console.error(`❌ Lỗi khi thêm ${vehicle.brand}:`, error.response ? error.response.data : error.message);
        }
    }
    
    console.log(`\n🎉 Quá trình bơm dữ liệu hoàn tất! Đã thêm thành công ${successCount}/${seedData.length} xe.`);
    console.log(`Hãy mở (Refresh) trình duyệt Web Dashboard để xem kết quả!`);
}

seed();
