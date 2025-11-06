import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Moon, Sun, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  lastMessage: string;
  time: string;
  unread?: number;
}

interface SidebarProps {
  contacts: Contact[];
  onlineUsers: Contact[];
  selectedContact: Contact | null;
  onSelectContact: (contact: Contact) => void;
  currentUser: { username: string; phone: string };
  onHandshake: (peer: string) => void;
  peer: string;
  setPeer: (peer: string) => void;
  handshakedUsers: string[];
  onCreateGroup?: (name: string, members: string[]) => void;
}

export default function Sidebar({
  contacts,
  onlineUsers,
  selectedContact,
  onSelectContact,
  currentUser,
  onHandshake,
  peer,
  setPeer,
  handshakedUsers,
  onCreateGroup,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [viewMode, setViewMode] = useState<'users_live' | 'chats'>('chats');
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');

  return (
    <div className="w-full lg:w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="bg-[#ededed] dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#075E54] to-[#128C7E] flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {currentUser.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.phone}</p>
          </div>
        </div>
        <motion.button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          whileTap={{ scale: 0.9 }}
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          ) : (
            <Sun className="w-5 h-5 text-gray-400" />
          )}
        </motion.button>
      </div>

      <div className="px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <motion.button
            onClick={() => setViewMode('chats')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'chats'
                ? 'bg-[#128C7E] text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            My Chats
          </motion.button>
          <motion.button
            onClick={() => setViewMode('users_live')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'users_live'
                ? 'bg-[#128C7E] text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            Users Live
          </motion.button>
        </div>
      </div>

      {viewMode === 'users_live' && (
        <div className="px-3 py-3 bg-[#f0f2f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter username to connect"
              value={peer}
              onChange={(e) => setPeer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onHandshake(peer)}
              className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
            />
            <motion.button
              onClick={() => onHandshake(peer)}
              className="px-4 py-2 bg-[#128C7E] text-white rounded-lg text-sm font-medium hover:bg-[#075E54] transition-colors"
              whileTap={{ scale: 0.95 }}
            >
              🤝 Connect
            </motion.button>
          </div>
          {/* New Group creator */}
          <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">CREATE GROUP</p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Group name (e.g., Friends)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
              />
              <input
                type="text"
                placeholder="Members (comma separated)"
                value={groupMembers}
                onChange={(e) => setGroupMembers(e.target.value)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
              />
              <motion.button
                onClick={() => {
                  if (!onCreateGroup) return;
                  const name = groupName.trim() || 'Group';
                  const members = groupMembers
                    .split(',')
                    .map((m) => m.trim())
                    .filter((m) => m && m !== currentUser.username);
                  if (members.length === 0) return;
                  onCreateGroup(name, members);
                  setGroupName('');
                  setGroupMembers('');
                }}
                className="px-4 py-2 bg-[#25D366] text-white rounded-lg text-sm font-medium hover:bg-[#1da851] transition-colors self-start"
                whileTap={{ scale: 0.95 }}
              >
                ➕ Create Group
              </motion.button>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Tip: include usernames like "pp, ss"</p>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'chats' && (
        <div className="px-3 py-2 bg-white dark:bg-gray-900">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats"
              className="w-full pl-12 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {viewMode === 'users_live' ? (
          <>
            <div className="px-4 py-2 bg-[#f0f2f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                ONLINE USERS ({onlineUsers.length})
              </span>
            </div>
            {onlineUsers.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                No other users online
              </div>
            ) : (
              onlineUsers.map((user) => (
                <motion.div
                  key={user.id}
                  onClick={() => setPeer(user.id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-medium text-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {user.name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {user.lastMessage}
                    </p>
                  </div>
                  {!handshakedUsers.includes(user.id) && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        onHandshake(user.id);
                      }}
                      className="px-3 py-1 bg-[#128C7E] text-white text-xs rounded-full hover:bg-[#075E54] transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      Connect
                    </motion.button>
                  )}
                </motion.div>
              ))
            )}
          </>
        ) : (
          <>
            <div className="px-4 py-2 bg-[#f0f2f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                MY CHATS ({contacts.length})
              </span>
            </div>
            {contacts.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                No chats yet. Connect with users from "Users Live" tab.
              </div>
            ) : (
              contacts.map((contact) => (
                <motion.div
                  key={contact.id}
                  onClick={() => onSelectContact(contact)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
                    selectedContact?.id === contact.id
                      ? 'bg-[#f0f2f5] dark:bg-gray-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                  whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-medium text-lg">
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {contact.name}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {contact.time}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {contact.lastMessage}
                      </p>
                      {contact.unread && contact.unread > 0 && (
                        <span className="ml-2 bg-[#25D366] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                          {contact.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
