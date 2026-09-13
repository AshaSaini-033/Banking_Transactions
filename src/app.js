const express = require('express');
const app = express();
const cookieParser = require("cookie-parser");





console.log("App is running");


const authRouter = require("./routes/auth.routes"); // auth wala oruter 
const accountRouter = require("./routes/account.routes");
const transactionRouter = require("./routes/transition.route");

app.get('/', (req, res) => {
    res.send('Welcome to the ASHA SAINI Backend Banking App API!');
});

app.use(cookieParser());
app.use(express.json());
app.use("/api/auth" , authRouter);
app.use("/api/account" , accountRouter);
app.use("/api/transactions" ,transactionRouter);
module.exports = app;
