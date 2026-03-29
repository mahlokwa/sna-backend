import dns from "dns";
import express from "express";
import cors from "cors";
import customersRoute from "./routes/customers.js";
import staffRoutes from "./routes/staff.js";
import paymentRoutes from "./routes/payments.js"; 
import bookingsRoutes from "./routes/bookings.js";

dns.setDefaultResultOrder("ipv4first");
const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/customers", customersRoute);
app.use("/api/staff", staffRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/bookings", bookingsRoutes);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});