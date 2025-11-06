import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Paperclip, Smile, Send, MoreVertical } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { Contact } from './Sidebar';

export interface Message {
  id: string;
  text: string;
  time: string;
  isSent: boolean;
  isRead?: boolean;
  image?: string;
  isSystem?: boolean;
  
}

interface ChatWindowProps {
  contact: Contact | null;
  messages: Message[];
  onSendMessage: (text?: string, image?: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack?: () => void;
}

export default function ChatWindow({
  contact,
  messages,
  onSendMessage,
  fileInputRef,
  onFileSelect,
  onBack,
}: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  if (!contact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f0f2f5] dark:bg-gray-900">
        <div className="text-center">
          <div className="w-64 h-64 mx-auto mb-8 opacity-10 dark:opacity-5">
            <svg viewBox="0 0 303 172" className="w-full h-full">
              <path
                fill="currentColor"
                d="M149.5 0C67 0 0 38.6 0 86.1c0 29.8 19.8 56.2 50.6 71.5-4.4 13.2-10.9 26-19.4 38.2-2.3 3.3-.7 7.9 3 8.7 13.9 3 36.9-1.7 56.6-15.3 17.4 5.8 36.3 8.9 56.2 8.9 82.5 0 149.5-38.6 149.5-86.1S232 0 149.5 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-light text-gray-600 dark:text-gray-400 mb-2">
            WhatsApp Secure
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md">
            Connect with users and start secure conversations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-gray-900 h-full">
  <div className="bg-[#f0f2f5] dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-3">
      {/* 👇 Back button — visible only on mobile */}
      <button
        onClick={onBack}
        className="md:hidden mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
      >
        ←
      </button>

      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
        <span className="text-white font-medium">
          {contact.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <div>
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          {contact.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Public Key: {contact.phone}
        </p>
      </div>
    </div>

    <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
      <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
    </button>
  </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message.text}
            time={message.time}
            isSent={message.isSent}
            isRead={message.isRead}
            image={message.image}
            isSystem={message.isSystem}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-[#f0f2f5] dark:bg-gray-800 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <Smile className="w-6 h-6" />
          </button>
          <motion.button
            type="button"
            onClick={triggerFileInput}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Paperclip className="w-6 h-6" />
          </motion.button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message"
            className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none"
          />
          <motion.button
            type="submit"
            className="p-2 bg-[#128C7E] text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!inputText.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
