import mysql from "mysql2";

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Kamo@2000", // your MySQL password
  database: "sna_driving_school",
  port: 3306
});

// Test the connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
  } else {
    console.log("Connected to MySQL!");
    connection.release(); // release back to pool
  }
});

export default db;

