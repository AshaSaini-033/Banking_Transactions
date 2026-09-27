require("dotenv").config();
const app=require("./src/app");
require("./src/config/redis");
const {connectDB}=require("./src/config/db");
const PORT=process.env.PORT||3000;
connectDB().then(()=>app.listen(PORT,()=>console.log(`Asha Banking Server is running on port ${PORT}`)));