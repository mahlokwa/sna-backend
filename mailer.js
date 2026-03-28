import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  family: 4, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendTokenEmail = async (toEmail, fullName, bookingToken) => {
  const mailOptions = {
    from: `"SNA Driving School - No Reply" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your SNA Driving School Booking Token',
    html: `
      <h2>Welcome to SNA Driving School, ${fullName}!</h2>
      <p>Your registration was successful. Here is your booking token:</p>
      <h1 style="color: #cc0000; letter-spacing: 4px;">${bookingToken}</h1>
      <p>Please keep this token safe — you will need it to access your bookings.</p>
      <p>If you have any questions, contact us at +27 (0) 079 248 1203.</p>
      <br/>
      <p>SNA Driving School</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};