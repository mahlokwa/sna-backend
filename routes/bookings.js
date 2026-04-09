import express from "express";
import db from "../db/connection.js";

const router = express.Router();

// ========================
// Verify Customer Token
// ========================
router.post("/verify-token", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  const sql = `
    SELECT 
      c.customerId,
      c.booking_token,
      c.fullName,
      c.phoneNumber,
      c.email,
      c.package_type,
      c.packagePrice,
      c.drivingLessonsPrice,
      c.learnersFee,
      c.totalLessons,
      c.pricePerLesson,
      c.lessonsUsed,
      COALESCE(SUM(p.amountPaid), 0) AS totalPaid,
      COALESCE(SUM(p.amountTowardLessons), 0) AS totalTowardLessons,
      COALESCE(SUM(p.amountTowardLearners), 0) AS totalTowardLearners
    FROM customers c
    LEFT JOIN payments p ON c.customerId = p.customerId
    WHERE c.booking_token = ?
    GROUP BY c.customerId
  `;

  db.query(sql, [token.trim().toUpperCase()], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error verifying token", 
        error: err.message 
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ 
        message: "Invalid token. Please check and try again." 
      });
    }

    const customer = results[0];

    // Calculate correctly
    const balanceOwing = parseFloat(customer.packagePrice) - parseFloat(customer.totalPaid);
    const lessonsUnlocked = Math.floor(customer.totalTowardLessons / customer.pricePerLesson);
    const lessonsRemaining = lessonsUnlocked - customer.lessonsUsed;

    res.json({
      message: "Token verified successfully",
      customer: {
        customerId: customer.customerId,
        fullName: customer.fullName,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        packageType: customer.package_type,
        packagePrice: parseFloat(customer.packagePrice),
        totalLessons: customer.totalLessons,
        pricePerLesson: parseFloat(customer.pricePerLesson),
        totalPaid: parseFloat(customer.totalPaid),
        totalTowardLessons: parseFloat(customer.totalTowardLessons),
        totalTowardLearners: parseFloat(customer.totalTowardLearners),
        balanceOwing: balanceOwing > 0 ? balanceOwing : 0,  // Never negative
        lessonsUnlocked: lessonsUnlocked,
        lessonsUsed: customer.lessonsUsed,
        lessonsRemaining: lessonsRemaining
      }
    });
  });
});

// ========================
// Create Booking
// ========================
router.post("/create", (req, res) => {
  const {
    customerId,
    bookingDate,
    bookingTime,
    lessonType,
    specialRequests
  } = req.body;

  if (!customerId || !bookingDate || !bookingTime) {
    return res.status(400).json({ 
      message: "Missing required fields: customerId, bookingDate, bookingTime" 
    });
  }

  // Check if customer has lessons remaining
  const checkSql = `
    SELECT 
      c.totalLessons,
      c.lessonsUsed,
      c.pricePerLesson,
      COALESCE(SUM(p.amountTowardLessons), 0) AS totalTowardLessons
    FROM customers c
    LEFT JOIN payments p ON c.customerId = p.customerId
    WHERE c.customerId = ?
    GROUP BY c.customerId
  `;

  db.query(checkSql, [customerId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error checking lesson availability", 
        error: err.message 
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const customer = results[0];
    const lessonsUnlocked = Math.floor(customer.totalTowardLessons / customer.pricePerLesson);
    const lessonsRemaining = lessonsUnlocked - customer.lessonsUsed;

   if (lessonsRemaining <= 0) {
      return res.status(403).json({ 
        message: "No lessons remaining. Please make a payment to unlock more lessons." 
      });
    }

    // ADD THIS - Check if slot is already full (max 2 bookings per slot)
    const convertTo24Hour = (time12h) => {
      const [time, modifier] = time12h.split(' ');
      let [hours, minutes] = time.split(':');
      if (modifier === 'AM' && hours === '12') hours = '00';
      if (modifier === 'PM' && hours !== '12') hours = String(parseInt(hours) + 12);
      return `${hours.padStart(2, '0')}:${minutes}`;
    };

    const startTime = convertTo24Hour(bookingTime);
    const [hours, minutes] = startTime.split(':');
    const totalMinutes = parseInt(hours) * 60 + parseInt(minutes) + 30;
    const endHour = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const endMin = (totalMinutes % 60).toString().padStart(2, '0');
    const endTime = `${endHour}:${endMin}`;

    const slotCheckSql = `
      SELECT COUNT(*) as bookingCount 
      FROM bookings 
      WHERE lessonDate = ? AND startTime = ? AND status != 'cancelled'
    `;

    db.query(slotCheckSql, [bookingDate, startTime], (slotErr, slotResults) => {
      if (slotErr) return res.status(500).json({ message: "Error checking slot availability" });
      
      if (slotResults[0].bookingCount >= 2) {
        return res.status(403).json({ message: "This time slot is fully booked. Please choose another time." });
      }

      // Create booking
      const insertSql = `
        INSERT INTO bookings 
        (customerId, lessonDate, startTime, endTime, status)
        VALUES (?, ?, ?, ?, 'booked')
      `;

      db.query(
        insertSql,
        [customerId, bookingDate, startTime, endTime],
        (err, result) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ 
              message: "Error creating booking", 
              error: err.message 
            });
          }

          // Update lessons used
          const updateSql = `UPDATE customers SET lessonsUsed = lessonsUsed + 1 WHERE customerId = ?`;
          db.query(updateSql, [customerId], (updateErr) => {
            if (updateErr) {
              console.error("Error updating lessons used:", updateErr);
            }
          });

          res.status(201).json({
            message: "Booking created successfully",
            bookingId: result.insertId,
            status: "booked"
          });
        }
      );
    });
  });
});
// ========================
// Get All Bookings (for staff)
// ========================
router.get("/all", (req, res) => {
  const sql = `
    SELECT 
      b.bookingId,
      b.customerId,
      b.lessonDate,
      b.startTime,
      b.endTime,
      b.status,
      b.instructorId,
      b.createdAt,
      c.fullName as customerName,
      c.phoneNumber as customerPhone,
      c.email as customerEmail,
      s.fullName as instructorName,
      s.phoneNumber as instructorPhone
    FROM bookings b
    JOIN customers c ON b.customerId = c.customerId
    LEFT JOIN staff s ON b.instructorId = s.staffId
    ORDER BY b.lessonDate DESC, b.startTime DESC
    LIMIT 100
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching bookings", 
        error: err.message 
      });
    }

    res.json(results);
  });
});

// ========================
// Get Available Instructors (for staff)
// ========================
router.get("/instructors", (req, res) => {
  const sql = `SELECT staffId, fullName, phoneNumber FROM staff ORDER BY fullName`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching instructors", 
        error: err.message 
      });
    }

    res.json(results);
  });
});

// ========================
// Update Booking Status & Assign Instructor (for staff)
// ========================
router.put("/update-status/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const { status, instructorId } = req.body;

  const sql = `
    UPDATE bookings 
    SET status = ?, instructorId = ?
    WHERE bookingId = ?
  `;

  db.query(sql, [status, instructorId || null, bookingId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error updating booking", 
        error: err.message 
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({ message: "Booking updated successfully" });
  });
});

// ========================
// Get Customer's Bookings
// ========================
router.get("/customer/:customerId", (req, res) => {
  const { customerId } = req.params;

  const sql = `
    SELECT 
      b.*,
      s.fullName as instructorName,
      s.phoneNumber as instructorPhone
    FROM bookings b
    LEFT JOIN staff s ON b.instructorId = s.staffId
    WHERE b.customerId = ?
    ORDER BY b.lessonDate DESC, b.startTime DESC
  `;

  db.query(sql, [customerId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching bookings", 
        error: err.message 
      });
    }

    res.json(results);
  });
});

// ========================
// Cancel Booking (for customers)
// ========================
router.put("/cancel/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const { customerId } = req.body;

  // Check if booking belongs to customer and is not confirmed
  const checkSql = `SELECT * FROM bookings WHERE bookingId = ? AND customerId = ?`;
  
  db.query(checkSql, [bookingId, customerId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = results[0];

    if (booking.status === 'confirmed') {
      return res.status(403).json({ 
        message: "Cannot cancel confirmed bookings. Please contact us." 
      });
    }

    // Cancel booking and return lesson
    const cancelSql = `UPDATE bookings SET status = 'cancelled' WHERE bookingId = ?`;
    db.query(cancelSql, [bookingId], (cancelErr) => {
      if (cancelErr) {
        return res.status(500).json({ message: "Error cancelling booking" });
      }

      // Return lesson to customer
      const returnLessonSql = `UPDATE customers SET lessonsUsed = lessonsUsed - 1 WHERE customerId = ?`;
      db.query(returnLessonSql, [customerId], (returnErr) => {
        if (returnErr) {
          console.error("Error returning lesson:", returnErr);
        }
      });

      res.json({ message: "Booking cancelled successfully" });
    });
  });
});

// ========================
// Accept Booking (Instructor assigns to themselves)
// ========================
router.put("/accept/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const { instructorId } = req.body;

  if (!instructorId) {
    return res.status(400).json({ message: "Instructor ID required" });
  }

  // 1️⃣ Check instructor exists
  db.query(
    "SELECT staffId FROM staff WHERE staffId = ?",
    [instructorId],
    (err, staffRows) => {
      if (err) {
        console.error("Staff check error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (staffRows.length === 0) {
        return res.status(404).json({ message: "Instructor not found" });
      }

      // 2️⃣ Get booking
      db.query(
        "SELECT * FROM bookings WHERE bookingId = ?",
        [bookingId],
        (err, bookingRows) => {
          if (err) {
            console.error("Booking fetch error:", err);
            return res.status(500).json({ message: "Database error" });
          }

          if (bookingRows.length === 0) {
            return res.status(404).json({ message: "Booking not found" });
          }

          const booking = bookingRows[0];

          if (booking.status !== "booked" || booking.instructorId !== null) {
            return res.status(409).json({
              message: "Booking already accepted"
            });
          }

          // 3️⃣ Check time conflict
          const conflictSql = `
            SELECT * FROM bookings
            WHERE instructorId = ?
              AND lessonDate = ?
              AND status IN ('booked','confirmed')
              AND (
                (startTime < ? AND endTime > ?) OR
                (startTime < ? AND endTime > ?)
              )
          `;

          db.query(
            conflictSql,
            [
              instructorId,
              booking.lessonDate,
              booking.endTime,
              booking.startTime,
              booking.startTime,
              booking.endTime
            ],
            (err, conflicts) => {
              if (err) {
                console.error("Conflict check error:", err);
                return res.status(500).json({ message: "Database error" });
              }

              if (conflicts.length > 0) {
                return res.status(409).json({
                  message: "Time conflict! You already have a booking at this time."
                });
              }

              // 4️⃣ Accept booking
              db.query(
                `
                UPDATE bookings
                SET status = 'confirmed', instructorId = ?
                WHERE bookingId = ?
                `,
                [instructorId, bookingId],
                (err, result) => {
                  if (err) {
                    console.error("Accept update error:", err);
                    return res.status(500).json({ message: "Database error" });
                  }

                  res.json({
                    message: "Booking accepted successfully",
                    bookingId
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});


// ========================
// Get Available Bookings (for all instructors)
// ========================
router.get("/available", (req, res) => {
  const sql = `
    SELECT 
      b.bookingId,
      b.customerId,
      b.lessonDate,
      b.startTime,
      b.endTime,
      b.createdAt,
      c.fullName as customerName,
      c.phoneNumber as customerPhone,
      TIMESTAMPDIFF(HOUR, b.createdAt, NOW()) as hoursAgo
    FROM bookings b
    JOIN customers c ON b.customerId = c.customerId
    WHERE b.status = 'booked' AND b.instructorId IS NULL
    ORDER BY b.lessonDate ASC, b.startTime ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

// ========================
// Get Instructor's Confirmed Bookings
// ========================
router.get("/instructor/:instructorId", (req, res) => {
  const { instructorId } = req.params;

  const sql = `
    SELECT 
      b.*,
      c.fullName as customerName,
      c.phoneNumber as customerPhone,
      c.email as customerEmail
    FROM bookings b
    JOIN customers c ON b.customerId = c.customerId
    WHERE b.instructorId = ? 
      AND b.status IN ('confirmed', 'completed')
    ORDER BY b.lessonDate DESC, b.startTime DESC
  `;

  db.query(sql, [instructorId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

// ========================
// Get Instructor's Payments (payments they recorded)
// ========================
router.get("/instructor-payments/:staffId", (req, res) => {
  const { staffId } = req.params;

  const sql = `
    SELECT 
      p.*,
      c.fullName as customerName,
      c.phoneNumber as customerPhone
    FROM payments p
    JOIN customers c ON p.customerId = c.customerId
    JOIN staff s ON p.recordedBy = s.fullName
    WHERE s.staffId = ?
    ORDER BY p.paymentDate DESC
    LIMIT 50
  `;

  db.query(sql, [staffId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

// ========================
// Instructor Cancel Their Own Booking
// ========================
router.put("/instructor-cancel/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const { instructorId } = req.body;

  // Check if booking belongs to this instructor
  const checkSql = `
    SELECT * FROM bookings 
    WHERE bookingId = ? 
      AND instructorId = ? 
      AND status = 'confirmed'
  `;
  
  db.query(checkSql, [bookingId, instructorId], (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ 
        message: "Booking not found or you cannot cancel it" 
      });
    }

    // Cancel: set back to 'booked' and remove instructor
    const cancelSql = `
      UPDATE bookings 
      SET status = 'booked', instructorId = NULL 
      WHERE bookingId = ?
    `;
    
    db.query(cancelSql, [bookingId], (cancelErr) => {
      if (cancelErr) {
        return res.status(500).json({ message: "Error cancelling booking" });
      }

      res.json({ 
        message: "Booking cancelled. It's now available for other instructors." 
      });
    });
  });
});

export default router;