const { Message, User, Booking, Session } = require('../models');
const { Op } = require('sequelize');

// Get chat history between two users
const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipientId } = req.params;
    
    // Check if users have a booking connection
    const hasBookingConnection = await checkBookingConnection(userId, recipientId);
    
    if (!hasBookingConnection) {
      return res.status(403).json({ 
        message: 'You can only chat with users you have a booking relationship with' 
      });
    }
    
    // Get messages between users
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId, receiverId: recipientId },
          { senderId: recipientId, receiverId: userId }
        ]
      },
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'username', 'profilePhoto']
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'name', 'username', 'profilePhoto']
        }
      ]
    });
    
    // Mark messages as read
    await Message.update(
      { isRead: true },
      {
        where: {
          senderId: recipientId,
          receiverId: userId,
          isRead: false
        }
      }
    );
    
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ message: 'Failed to get chat history', error: error.message });
  }
};

// Send a message
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;
    
    if (!content || !receiverId) {
      return res.status(400).json({ message: 'Recipient ID and message content are required' });
    }
    
    // Check if users have a booking connection
    const hasBookingConnection = await checkBookingConnection(senderId, receiverId);
    
    if (!hasBookingConnection) {
      return res.status(403).json({ 
        message: 'You can only chat with users you have a booking relationship with' 
      });
    }
    
    // Create message
    const message = await Message.create({
      senderId,
      receiverId,
      content,
      isRead: false
    });
    
    // Include sender and receiver info in response
    const messageWithUsers = await Message.findByPk(message.id, {
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'username', 'profilePhoto']
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'name', 'username', 'profilePhoto']
        }
      ]
    });
    
    res.status(201).json({
      message: 'Message sent successfully',
      data: messageWithUsers
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

// Get user's chat contacts
const getChatContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find all users the current user has chatted with
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      attributes: ['senderId', 'receiverId'],
      group: ['senderId', 'receiverId']
    });
    
    // Extract unique user IDs
    const contactIds = new Set();
    messages.forEach(message => {
      if (message.senderId !== userId) {
        contactIds.add(message.senderId);
      }
      if (message.receiverId !== userId) {
        contactIds.add(message.receiverId);
      }
    });
    
    // Get user details for contacts
    const contacts = await User.findAll({
      where: {
        id: {
          [Op.in]: [...contactIds]
        }
      },
      attributes: ['id', 'name', 'username', 'profilePhoto']
    });
    
    // Get unread message count for each contact
    const contactsWithUnreadCount = await Promise.all(
      contacts.map(async (contact) => {
        const unreadCount = await Message.count({
          where: {
            senderId: contact.id,
            receiverId: userId,
            isRead: false
          }
        });
        
        return {
          ...contact.toJSON(),
          unreadCount
        };
      })
    );
    
    res.status(200).json({ contacts: contactsWithUnreadCount });
  } catch (error) {
    console.error('Get chat contacts error:', error);
    res.status(500).json({ message: 'Failed to get chat contacts', error: error.message });
  }
};

// Helper function to check if users have a booking connection
const checkBookingConnection = async (userId1, userId2) => {
  // Check if user1 is a teacher and user2 is a learner
  const user1TeacherBookings = await Booking.findOne({
    include: [
      {
        model: Session,
        where: { teacherId: userId1 }
      }
    ],
    where: { learnerId: userId2 }
  });
  
  if (user1TeacherBookings) {
    return true;
  }
  
  // Check if user2 is a teacher and user1 is a learner
  const user2TeacherBookings = await Booking.findOne({
    include: [
      {
        model: Session,
        where: { teacherId: userId2 }
      }
    ],
    where: { learnerId: userId1 }
  });
  
  return !!user2TeacherBookings;
};

module.exports = {
  getChatHistory,
  sendMessage,
  getChatContacts
}; 