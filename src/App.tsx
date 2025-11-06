import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import Splash from './components/Splash';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import type { Contact } from './components/Sidebar';
import { ThemeProvider } from './context/ThemeContext';
import {
  connect,
  registerUserListCallback,
  registerGroupListCallback,
  sendMessage,
  initiateHandshake,
  disconnect,
  createGroup,
  sendGroupMessage
} from './socket';

type AppState = 'splash' | 'login' | 'chat';

// Message type that matches the one in ChatWindow
type Message = {
  id: string;
  text: string;
  image?: string;
  time: string;
  isSent: boolean;
  isRead?: boolean;
  isSystem?: boolean;
  timestamp?: string;
};

interface WSMessage {
  type: string;
  from: string;
  to?: string;
  text?: string;
  msg?: string;
  image?: string;
  timestamp?: string;
  peer?: string;
  users?: string[];
  message?: string;
}

function AppContent() {
  const [appState, setAppState] = useState<AppState>('splash');
  const [currentUser, setCurrentUser] = useState<{ username: string; phone: string } | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  const [groups, setGroups] = useState<Array<{id: string; name: string; members: string[]}>>([]);
  const messageListRef = useRef<Record<string, Message[]>>({});
  const [handshakedUsers, setHandshakedUsers] = useState<string[]>([]);
  const [peer, setPeer] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false); // for WhatsApp-style mobile chat toggle

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      try {
        disconnect('User navigated away');
      } catch (error) {
        console.error('Error during WebSocket cleanup:', error);
      }
    };
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    const storedUser = localStorage.getItem('chat-user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        setAppState('chat');
        initializeWebSocket(user.username);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('chat-user');
        setAppState('login');
      }
    }
  }, []);

  const initializeWebSocket = useCallback((username: string) => {
    console.log('🔌 Initializing WebSocket for user:', username);
    
    // Register user list callback
    registerUserListCallback((users: string[]) => {
      console.log('👥 Received user list update:', users);
      
      try {
        if (!Array.isArray(users)) {
          console.error('❌ User list is not an array:', users);
          return;
        }
        
        // Update connected users list (filter out current user)
        const filteredUsers = users.filter(user => user !== username);
        setConnectedUsers(filteredUsers);
        
        // Update handshaked users to only include those who are still connected
        setHandshakedUsers(prev => 
          prev.filter(user => filteredUsers.includes(user))
        );
      } catch (error) {
        console.error('❌ Error processing user list:', error);
      }
    });

    // Register group list callback
    registerGroupListCallback((gs) => {
      try {
        setGroups((prev) => {
          const map = new Map(prev.map(g => [g.id, g]));
          for (const g of gs) map.set(g.id, g);
          return Array.from(map.values());
        });
      } catch (e) {
        console.error('❌ Error processing group list:', e);
      }
    });

    connect(username, (msg: WSMessage) => {
      if (!msg) return;
      console.log('WebSocket message received:', msg);

      // Handle message based on type
      const handleMessage = (msg: WSMessage) => {
        if (!msg.from) {
          console.warn('Received message without sender');
          return;
        }
        
        const messageText = msg.text || msg.msg || '';
        
        // Skip empty messages
        if (!messageText && !msg.image) {
          console.warn('Received empty message');
          return;
        }

        const newMsg: Message = {
          id: `${msg.from}-${Date.now()}`,
          text: msg.text || msg.msg || '',
          image: msg.image,
          time: msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          isSent: false,
          isRead: false,
        };

        if (newMsg.text || newMsg.image) {
          setMessages(prev => {
            const updated = {
              ...prev,
              [msg.from!]: [...(prev[msg.from!] || []), newMsg],
            };
            messageListRef.current = updated;
            return updated;
          });
        }
      };

      switch (msg.type) {
        case 'message':
        case 'image':
          handleMessage(msg);
          break;

        case 'group_message': {
          const groupId = (msg as any).groupId as string;
          const fromUser = (msg as any).from as string;
          const messageText = (msg as any).text || (msg as any).msg || '';
          const image = (msg as any).image;
          const newMsg: Message = {
            id: `${groupId}-${Date.now()}`,
            text: messageText ? `${fromUser}: ${messageText}` : `${fromUser}: [image]`,
            image,
            time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            isSent: false,
            isRead: false,
          };
          setMessages(prev => {
            const updated = {
              ...prev,
              [groupId]: [...(prev[groupId] || []), newMsg],
            };
            messageListRef.current = updated;
            return updated;
          });
          break;
        }

        case 'handshake_success': {
          const peerUsername = msg.peer;
          if (peerUsername && peerUsername !== username) {
            setHandshakedUsers(prev => 
              prev.includes(peerUsername) ? prev : [...prev, peerUsername]
            );

            const systemMsg: Message = {
              id: `system-${Date.now()}`,
              text: `🔒 Secure connection established with ${peerUsername}`,
              time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              isSystem: true,
              isSent: false,
            };

            setMessages(prev => {
              const updated = {
                ...prev,
                [peerUsername]: [...(prev[peerUsername] || []), systemMsg],
              };
              messageListRef.current = updated;
              return updated;
            });
          }
          break;
        }

        case 'user_joined':
          console.log(`👋 User ${msg.from} joined the chat`);
          break;

        case 'user_left':
          console.log(`👋 User ${msg.from} left the chat`);
          break;

        case 'error':
          console.error('Server error:', msg.message || 'Unknown error');
          break;

        default:
          console.warn('Unhandled message type:', msg.type, msg);
      }
    });
  }, []);

  const handleSplashComplete = () => setAppState('login');

  const handleLogin = useCallback((username: string, phone: string) => {
    const trimmedUsername = username.trim();
    const trimmedPhone = phone.trim();
    
    if (!trimmedUsername || !trimmedPhone) {
      alert('Please enter both username and phone number');
      return;
    }
    
    const user = { 
      username: trimmedUsername, 
      phone: trimmedPhone 
    };
    
    setCurrentUser(user);
    localStorage.setItem('chat-user', JSON.stringify(user));
    setAppState('chat');
    initializeWebSocket(trimmedUsername);
  }, [initializeWebSocket]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    if (window.innerWidth < 768) setIsMobileChatOpen(true);
  };

  const handleBackToChats = () => {
    setIsMobileChatOpen(false);
    setSelectedContact(null);
  };

  const handleHandshake = useCallback((peerUsername: string): void => {
    if (!currentUser?.username) {
      console.error('User not logged in');
      return;
    }
    
    if (peerUsername === currentUser.username) {
      console.warn('Cannot handshake with yourself');
      return;
    }
    
    if (handshakedUsers.includes(peerUsername)) {
      console.log('Already handshaked with', peerUsername);
      return;
    }
    
    console.log('Initiating handshake with', peerUsername);
    const success = initiateHandshake(peerUsername);
    
    if (success) {
      setPeer('');
      
      // Add a local message indicating handshake was sent
      const systemMsg: Message = {
        id: `handshake-${Date.now()}`,
        text: `🤝 Handshake request sent to ${peerUsername}`,
        time: new Date().toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        }),
        isSystem: true,
        isSent: true,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => ({
        ...prev,
        [peerUsername]: [...(prev[peerUsername] || []), systemMsg]
      }));
    } else {
      console.error('Failed to send handshake');
      alert('Failed to initiate handshake. Please try again.');
    }
  }, [currentUser, handshakedUsers]);

  const handleSendMessage = useCallback((text: string = '', image?: string): void => {
    if (!selectedContact?.id || !currentUser?.username) {
      console.error('No contact selected or user not logged in');
      return;
    }
    
    if (!text && !image) {
      console.warn('Attempted to send empty message');
      return;
    }
    const isGroup = selectedContact.id.startsWith('grp:');
    if (!isGroup && !handshakedUsers.includes(selectedContact.id)) {
      alert(`Please complete the handshake with ${selectedContact.id} before sending messages.`);
      return;
    }

    const messageContent = text?.trim() || '';
    const messageId = `${currentUser.username}-${Date.now()}`;
    
    const newMessage: Message = {
      id: messageId,
      text: messageContent,
      image: image,
      time: new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      }),
      isSent: true,
      isRead: false,
      timestamp: new Date().toISOString()
    };

    // Optimistic UI update
    setMessages(prev => {
      const updated = {
        ...prev,
        [selectedContact.id]: [
          ...(prev[selectedContact.id] || []), 
          newMessage
        ]
      };
      messageListRef.current = updated;
      return updated;
    });

    // Send the message
    if (isGroup) {
      sendGroupMessage(selectedContact.id, messageContent || undefined, image);
    } else {
      sendMessage(
        selectedContact.id, 
        messageContent || undefined, 
        image
      );
    }
  }, [selectedContact, currentUser, handshakedUsers]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) {
      console.warn('No file selected');
      return;
    }
    
    if (!selectedContact) {
      console.error('No contact selected');
      return;
    }
    
    // Check file size (e.g., 5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      alert('File size exceeds 5MB limit');
      return;
    }
    
    const reader = new FileReader();
    
    reader.onloadstart = () => {
      console.log('Starting file read...');
    };
    
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      alert('Error reading file. Please try another file.');
    };
    
    reader.onload = (ev) => {
      if (!ev.target?.result) {
        console.error('No result from file read');
        return;
      }
      
      const base64 = ev.target.result as string;
      console.log('File read successfully, size:', base64.length);
      handleSendMessage(undefined, base64);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    // Read the file as data URL
    reader.readAsDataURL(file);
  }, [selectedContact, handleSendMessage]);

  // Memoize contacts to prevent unnecessary re-renders
  const contacts = useMemo<Contact[]>(() => {
    const userContacts = handshakedUsers.map((user) => ({
      id: user,
      name: user,
      phone: 'Connected',
      lastMessage: 'Tap to start chatting',
      time: 'Now',
      unread: 0,
    }));
    const groupContacts = groups.map(g => ({
      id: g.id,
      name: g.name,
      phone: `Group (${g.members.length})`,
      lastMessage: 'Group ready',
      time: 'Now',
      unread: 0,
    }));
    return [...groupContacts, ...userContacts];
  }, [handshakedUsers, groups]);

  // Memoize online contacts
  const onlineContacts: Contact[] = useMemo(() => {
    if (!currentUser?.username) return [];
    
    return connectedUsers
      .filter((user): user is string => typeof user === 'string' && user !== currentUser.username)
      .map(user => ({
        id: user,
        name: user,
        phone: 'Online',
        lastMessage: handshakedUsers.includes(user) ? '✓ Secure' : '● Available',
        time: 'Now',
      }));
  }, [connectedUsers, handshakedUsers, currentUser]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900">
      <AnimatePresence mode="wait">
        {appState === 'splash' && <Splash key="splash" onComplete={handleSplashComplete} />}
        {appState === 'login' && <Login key="login" onLogin={handleLogin} />}
        {appState === 'chat' && currentUser && (
          <div key="chat" className="flex h-full">
            {/* Desktop layout */}
            <div className="hidden md:flex w-full">
              <Sidebar
                contacts={contacts}
                onlineUsers={onlineContacts}
                selectedContact={selectedContact}
                onSelectContact={handleSelectContact}
                currentUser={currentUser}
                onHandshake={handleHandshake}
                peer={peer}
                setPeer={setPeer}
                handshakedUsers={handshakedUsers}
                onCreateGroup={(name, members) => {
                  try {
                    console.log('Creating group', name, members);
                    createGroup(name, members);
                  } catch (e) {
                    console.error('Failed to create group:', e);
                  }
                }}
              />
              <ChatWindow
                contact={selectedContact}
                messages={selectedContact ? messages[selectedContact.id] || [] : []}
                onSendMessage={handleSendMessage}
                fileInputRef={fileInputRef}
                onFileSelect={handleFileSelect}
                onBack={handleBackToChats}
              />
            </div>

            {/* Mobile layout */}
            <div className="flex md:hidden w-full h-full">
              {!isMobileChatOpen ? (
                <Sidebar
                  contacts={contacts}
                  onlineUsers={onlineContacts}
                  selectedContact={selectedContact}
                  onSelectContact={handleSelectContact}
                  currentUser={currentUser}
                  onHandshake={handleHandshake}
                  peer={peer}
                  setPeer={setPeer}
                  handshakedUsers={handshakedUsers}
                  onCreateGroup={(name, members) => {
                    try {
                      console.log('Creating group', name, members);
                      createGroup(name, members);
                    } catch (e) {
                      console.error('Failed to create group:', e);
                    }
                  }}
                />
              ) : (
                <ChatWindow
                  contact={selectedContact}
                  messages={selectedContact ? messages[selectedContact.id] || [] : []}
                  onSendMessage={handleSendMessage}
                  fileInputRef={fileInputRef}
                  onFileSelect={handleFileSelect}
                  onBack={handleBackToChats}
                />
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;