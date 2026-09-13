const app = require("./src/app");
require("dotenv").config();
require("./src/config/redis");
const connectToDb = require("./src/config/db");
app.listen(3000, () => {
    console.log("Hii Asha Server is running on port 3000");
})

connectToDb();