const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key-here";

let gearStock = {};
let gearMaxStock = {};
let timeUntilRestock;
let restockInterval = 60 * 5; 
let lastRestockId = null;
let longPollResponses = [];

const GEAR_DATA = [
    // This should mirror your Roblox GearData module
    { Name: "Sword", Rarity: "Common", StockChance: 0.8, StockQuantity: { Min: 10, Max: 20 }, MoneyPrice: 50 },
    { Name: "Staff", Rarity: "Rare", StockChance: 0.6, StockQuantity: { Min: 5, Max: 10 }, MoneyPrice: 150 },
    { Name: "Bow", Rarity: "Epic", StockChance: 0.4, StockQuantity: { Min: 2, Max: 5 }, MoneyPrice: 500 },
    { Name: "Scythe", Rarity: "Legendary", StockChance: 0.2, StockQuantity: { Min: 1, Max: 2 }, MoneyPrice: 2000 },
    { Name: "Void Blade", Rarity: "Mythic", StockChance: 0.05, StockQuantity: { Min: 1, Max: 1 }, MoneyPrice: 10000 },
];

const MAX_STOCK_MULTIPLIER = 2;

function initializeStock() {
    GEAR_DATA.forEach(data => {
        const maxPossibleStock = data.StockQuantity.Max;
        gearMaxStock[data.Name] = maxPossibleStock * MAX_STOCK_MULTIPLIER;
    });
}

function performRestock() {
    console.log("Performing a global restock...");
    const newStock = {};
    GEAR_DATA.forEach(data => {
        let initialStock = 0;
        if (Math.random() < data.StockChance) {
            initialStock = Math.floor(Math.random() * (data.StockQuantity.Max - data.StockQuantity.Min + 1)) + data.StockQuantity.Min;
        }
        newStock[data.Name] = initialStock;
    });
    gearStock = newStock;
    timeUntilRestock = restockInterval;
    lastRestockId = uuidv4();
    console.log(`New restock ID: ${lastRestockId}`);

    longPollResponses.forEach(res => {
        res.status(200).json({ restockId: lastRestockId });
    });
    longPollResponses = [];
}

const authMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === SECRET_KEY) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
};

app.get('/stock', authMiddleware, (req, res) => {
    res.status(200).json({
        gearStock,
        timeUntilRestock,
        restockId: lastRestockId
    });
});

app.post('/force-restock', authMiddleware, (req, res) => {
    performRestock();
    res.status(200).json({
        message: "Restock forced successfully.",
        restockId: lastRestockId,
        gearStock
    });
});

app.post('/set-timer', authMiddleware, (req, res) => {
    const { newInterval } = req.body;
    if (typeof newInterval === 'number' && newInterval > 0) {
        restockInterval = newInterval;
        timeUntilRestock = newInterval;
        res.status(200).send(`Restock interval updated to ${newInterval} seconds.`);
    } else {
        res.status(400).send('Invalid interval provided.');
    }
});


app.get('/listen-for-restock', authMiddleware, (req, res) => {
    const clientRestockId = req.query.currentId;
    if (clientRestockId !== lastRestockId && lastRestockId !== null) {
        res.status(200).json({ restockId: lastRestockId });
    } else {
        longPollResponses.push(res);
    }
});


app.get('/health', (req, res) => {
    res.status(200).send('Server is up and running.');
});

app.listen(PORT, () => {
    initializeStock();
    performRestock();
    setInterval(() => {
        timeUntilRestock--;
        if (timeUntilRestock <= 0) {
            performRestock();
        }
    }, 1000);
    console.log(`Server listening on port ${PORT}`);
});
