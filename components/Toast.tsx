'use client'
import { AnimatePresence, motion } from 'framer-motion'

export default function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="toast" role="status"
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
