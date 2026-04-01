import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendTokenEmail = async (toEmail, fullName, bookingToken) => {
  await resend.emails.send({
    from: 'SNA Driving School - No Reply <noreply@snadriving.co.za>',
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
  });
};