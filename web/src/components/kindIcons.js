// Ícone de cada tipo de registro da linha do tempo (usado no formulário e na lista).
import { FileBarChart, Mail, MessageCircle, Phone, Sparkles, StickyNote, ThumbsDown, ThumbsUp, Users } from 'lucide-react'

export const KIND_ICONS = {
  meeting: Users,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  report: FileBarChart,
  complaint: ThumbsDown,
  praise: ThumbsUp,
  note: StickyNote,
  optimization: Sparkles,
}
