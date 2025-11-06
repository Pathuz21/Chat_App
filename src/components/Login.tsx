import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, phone: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const validatePhone = (phone: string) => {
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && phone.trim() && validatePhone(phone)) {
      onLogin(username.trim(), phone.trim());
    }
  };

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#075E54] to-[#128C7E]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-black/10" />

      <motion.div
        className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.5 }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gradient-to-br from-[#075E54] to-[#128C7E] p-4 rounded-full mb-4">
            <MessageCircle className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-semibold text-gray-800 dark:text-white mb-2">
            Welcome to Chat
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Enter your details to start chatting
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition-all"
              required
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter 10 digit number"
              className={`w-full px-4 py-3 rounded-lg border ${phoneError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-transparent transition-all`}
              maxLength={10}
              pattern="\d{10}"
              title="Please enter exactly 10 digits"
              required
            />
          </div>

          <motion.button
            type="submit"
            className="w-full bg-gradient-to-r from-[#075E54] to-[#128C7E] text-white font-medium py-3 rounded-lg hover:shadow-lg transition-shadow"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Continue
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  );
}
