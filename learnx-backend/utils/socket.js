const { Message, User } = require('../models');
const jwt = require('jsonwebtoken');

module.exports = (io) => {
  // Store active users
  const activeUsers = new Map(); // userId -> socketId

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    
    console.log(`User connected: ${userId}`);
    
    // Add user to active users
    activeUsers.set(userId, socket.id);
    
    // Send online status to all connected clients
    io.emit('userStatus', {
      userId,
      status: 'online'
    });
    
    // Handle private message
    socket.on('privateMessage', async (data) => {
      try {
        const { receiverId, content } = data;
        
        // Save message to database
        const message = await Message.create({
          senderId: userId,
          receiverId,
          content,
          isRead: false
        });
        
        // Get sender info
        const sender = await User.findByPk(userId, {
          attributes: ['id', 'name', 'username', 'profilePhoto']
        });
        
        // Get receiver info
        const receiver = await User.findByPk(receiverId, {
          attributes: ['id', 'name', 'username', 'profilePhoto']
        });
        
        const messageData = {
          id: message.id,
          content: message.content,
          senderId: message.senderId,
          receiverId: message.receiverId,
          isRead: message.isRead,
          createdAt: message.createdAt,
          sender,
          receiver
        };
        
        // Send to receiver if online
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('privateMessage', messageData);
        }
        
        // Send back to sender
        socket.emit('privateMessage', messageData);
      } catch (error) {
        console.error('Socket message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // Handle read receipts
    socket.on('markAsRead', async (data) => {
      try {
        const { messageId } = data;
        
        // Update message in database
        await Message.update(
          { isRead: true },
          { where: { id: messageId, receiverId: userId } }
        );
        
        // Notify sender if online
        const message = await Message.findByPk(messageId);
        if (message) {
          const senderSocketId = activeUsers.get(message.senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('messageRead', { messageId });
          }
        }
      } catch (error) {
        console.error('Mark as read error:', error);
      }
    });
    
    // Handle typing indicator
    socket.on('typing', (data) => {
      const { receiverId } = data;
      const receiverSocketId = activeUsers.get(receiverId);
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing', { userId });
      }
    });
    
    // Handle stop typing
    socket.on('stopTyping', (data) => {
      const { receiverId } = data;
      const receiverSocketId = activeUsers.get(receiverId);
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('stopTyping', { userId });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
      
      // Remove from active users
      activeUsers.delete(userId);
      
      // Broadcast offline status
      io.emit('userStatus', {
        userId,
        status: 'offline'
      });
    });
  });
}; 