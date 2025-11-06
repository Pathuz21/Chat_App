import { motion } from 'framer-motion';
import { Check, CheckCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: string;
  time: string;
  isSent: boolean;
  isRead?: boolean;
  image?: string;
  isSystem?: boolean;
}

export default function MessageBubble({
  message,
  time,
  isSent,
  isRead = false,
  image,
  isSystem = false,
}: MessageBubbleProps) {
  if (isSystem) {
    return (
      <motion.div
        className="flex justify-center my-3"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg text-xs font-medium shadow-sm">
          {message}
        </div>
      </motion.div>
    );
  }

  const messageContent = image ? (
    <img
      src={image.startsWith('data:') ? image : `data:image/png;base64,${image}`}
      alt="Sent"
      className="max-w-full rounded-lg"
      style={{ maxWidth: '300px', maxHeight: '400px' }}
    />
  ) : (
    <p className="text-sm text-gray-800 dark:text-gray-100 break-words whitespace-pre-wrap">
      {message}
    </p>
  );

  return (
    <motion.div
      className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm ${
          isSent
            ? 'bg-[#DCF8C6] dark:bg-[#056162] rounded-br-sm'
            : 'bg-white dark:bg-gray-700 rounded-bl-sm'
        }`}
      >
        {messageContent}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">{time}</span>
          {isSent && (
            <span className="text-gray-500 dark:text-gray-400">
              {isRead ? (
                <CheckCheck className="w-4 h-4 text-blue-500" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
