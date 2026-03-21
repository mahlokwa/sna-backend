// Utility function to generate unique customer tokens
export const generateCustomerToken = () => {
  // Format: CUST-XXXXXXXX (8 characters - easy to read, no confusing characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing 0,O,1,I
  let token = 'CUST-';
  
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return token;
};