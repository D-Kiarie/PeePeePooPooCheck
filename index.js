const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- Configuration ---
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY;

// --- Critical Startup Check ---
if (!SECRET_KEY) {
    console.error("FATAL ERROR: The SECRET_KEY environment variable is not set on Render.");
    console.error("Please go to your service's 'Environment' tab and set this value.");
    process.exit(1);
}

console.log("SECRET_KEY loaded successfully.");

// --- In-Memory State ---
let gearStock = {};
let timeUntilRestock;
let restockInterval = 60 * 5; // 5 minutes
let lastRestockId = null;
let longPollResponses = [];

const GEAR_DATA = [
	{ Name: "Smart Remote", Rarity: "Common", StockChance: 0.9, StockQuantity: {Min: 8, Max: 12} },
	{ Name: "Slap hand", Rarity: "Rare", StockChance: 0.7, StockQuantity: {Min: 3, Max: 6} },
	{ Name: "Jade Clover", Rarity: "Rare", StockChance: 0.6, StockQuantity: {Min: 2, Max: 5} },
	{ Name: "Advanced Remote", Rarity: "Epic", StockChance: 0.4, StockQuantity: {Min: 1, Max: 3} },
	{ Name: "Brainrot Swapper 6000", Rarity: "Legendary", StockChance: 0.1, StockQuantity: {Min: 1, Max: 1} }
];

// --- Core Logic ---
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
    console.log(`New restock performed. ID: ${lastRestockId}`);

    longPollResponses.forEach(res => {
        try {
            if (!res.headersSent) {
                res.status(200).json({ restockId: lastRestockId });
            }
        } catch (error) {
            console.error("Error responding to a long poll request:", error);
        }
    });
    longPollResponses = [];
}

// --- Middleware ---
const authMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === SECRET_KEY) {
        return next();
    }
    res.status(401).send('Unauthorized: Missing or incorrect API key.');
};

// --- API Routes ---
app.get('/health', (req, res) => {
    res.status(200).send('Server is healthy and running.');
});

app.use(authMiddleware);

app.get('/stock', (req, res) => {
    res.status(200).json({
        gearStock,
        timeUntilRestock,
        restockId: lastRestockId
    });
});

app.post('/force-restock', (req, res) => {
    performRestock();
    res.status(200).json({
        message: "Restock forced successfully.",
        restockId: lastRestockId,
        gearStock
    });
});

app.post('/set-timer', (req, res) => {
    const { newInterval } = req.body;
    if (typeof newInterval === 'number' && newInterval > 0) {
        restockInterval = newInterval;
        timeUntilRestock = newInterval;
        console.log(`Restock interval updated to ${newInterval} seconds.`);
        res.status(200).send(`Restock interval updated to ${newInterval} seconds.`);
    } else {
        res.status(400).send('Invalid interval provided. It must be a positive number.');
    }
});

app.get('/listen-for-restock', (req, res) => {
    const clientRestockId = req.query.currentId;
    if (clientRestockId !== lastRestockId && lastRestockId !== null) {
        res.status(200).json({ restockId: lastRestockId });
    } else {
        longPollResponses.push(res);
        req.on('close', () => {
            longPollResponses = longPollResponses.filter(response => response !== res);
        });
    }
});

// --- Server Initialization ---
try {
    performRestock(); // Initial stock generation

    setInterval(() => {
        if (typeof timeUntilRestock === 'number') {
            timeUntilRestock--;
        } else {
            timeUntilRestock = restockInterval; // Failsafe
        }
        
        if (timeUntilRestock <= 0) {
            performRestock();
        }
    }, 1000);

    app.listen(PORT, () => {
        console.log(`Server started successfully on port ${PORT}. Ready for connections.`);
    });
} catch (error) {
    console.error("A critical error occurred during server startup:", error);
    process.exit(1);
}

