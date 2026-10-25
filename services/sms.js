import AfricasTalking from 'africastalking'
import Notification from '../models/Notification.js'

const smsConfigured = Boolean(process.env.AT_API_KEY)

const sms = smsConfigured
  ? AfricasTalking({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME || 'sandbox',
    }).SMS
  : null

if (!smsConfigured) {
  console.warn('⚠️ SMS is disabled: AT_API_KEY is not configured')
}

// Send a single SMS and log it to MongoDB
export async function sendSMS({ to, message, recipient, triggeredBy = 'manual', studentId, busId }) {
  const notification = new Notification({
    type:        'sms',
    recipient:   recipient || to,
    phone:       to,
    message,
    status:      'pending',
    triggeredBy,
    studentId,
    busId,
    eventType: triggeredBy,
  })

  if (!sms) {
    notification.status = 'skipped'
    notification.error = 'SMS provider is not configured'
    await notification.save()
    console.warn(`⚠️ SMS logged but skipped for ${to}: provider is not configured`)
    return { success: false, skipped: true, notification, error: notification.error }
  }

  try {
    const result = await sms.send({
      to:      Array.isArray(to) ? to : [to],
      message,
      from:    process.env.AT_SENDER_ID || undefined,
    })

    const recipients = result.SMSMessageData?.Recipients || []
    const success    = recipients.some(r => r.status === 'Success' || r.statusCode === 101)

    notification.status      = success ? 'sent' : 'failed'
    notification.atMessageId = recipients[0]?.messageId || null
    notification.count       = recipients.length
    if (!success) notification.error = recipients[0]?.status || 'Unknown error'

    await notification.save()
    console.log(`📱 SMS ${success ? 'sent' : 'failed'} to ${to}: ${message.slice(0, 40)}...`)
    return { success, notification }
  } catch (err) {
    notification.status = 'failed'
    notification.error  = err.message
    await notification.save()
    console.error(`❌ SMS error to ${to}:`, err.message)
    return { success: false, notification, error: err.message }
  }
}

// Send SMS to multiple numbers at once
export async function sendBulkSMS({ numbers, message, recipient, triggeredBy = 'manual', busId }) {
  if (!sms) {
    console.warn('⚠️ Bulk SMS skipped: provider is not configured')
    return {
      success: false,
      skipped: true,
      error: 'SMS provider is not configured',
    }
  }

  if (!numbers || numbers.length === 0) return { success: false, error: 'No numbers provided' }

  const notification = new Notification({
    type:        'sms',
    recipient:   recipient || 'Multiple recipients',
    message,
    status:      'pending',
    triggeredBy,
    busId,
    count:       numbers.length,
  })

  try {
    const result = await sms.send({
      to:      numbers,
      message,
      from:    process.env.AT_SENDER_ID || undefined,
    })

    const recipients = result.SMSMessageData?.Recipients || []
    const success    = recipients.some(r => r.status === 'Success' || r.statusCode === 101)

    notification.status = success ? 'sent' : 'failed'
    notification.count  = recipients.length
    if (!success) notification.error = 'Bulk send failed'

    await notification.save()
    return { success, notification }
  } catch (err) {
    notification.status = 'failed'
    notification.error  = err.message
    await notification.save()
    return { success: false, error: err.message }
  }
}

// Auto-trigger: student boarded
export async function notifyBoarding({ student, busId }) {
  if (!student.phone) return
  const message = `BusNest: ${student.name} has boarded bus ${busId} at ${student.stop}. They are on their way to school.`
  return sendSMS({
    to:          student.phone,
    message,
    recipient:   student.parent || student.name,
    triggeredBy: 'boarding',
    studentId:   student.studentId,
    busId,
  })
}

// Auto-trigger: student dropped off
export async function notifyDropoff({ student, busId }) {
  if (!student.phone) return
  const message = `BusNest: ${student.name} has been safely dropped off at school from bus ${busId}. Have a great day!`
  return sendSMS({
    to:          student.phone,
    message,
    recipient:   student.parent || student.name,
    triggeredBy: 'dropoff',
    studentId:   student.studentId,
    busId,
  })
}

// Auto-trigger: bus near pickup stop
export async function notifyBusApproaching({ student, busId, minutesAway }) {
  if (!student.phone) return
  const message = `BusNest: Bus ${busId} is ${minutesAway} minute${minutesAway !== 1 ? 's' : ''} away from ${student.stop}. Please have ${student.name} ready!`
  return sendSMS({
    to:          student.phone,
    message,
    recipient:   student.parent || student.name,
    triggeredBy: 'geofence',
    studentId:   student.studentId,
    busId,
  })
}

// Auto-trigger: student absent
export async function notifyAbsence({ student, busId }) {
  if (!student.phone) return
  const message = `BusNest: ${student.name} was not detected at ${student.stop} today. Please contact the school if this is unexpected.`
  return sendSMS({
    to:          student.phone,
    message,
    recipient:   student.parent || student.name,
    triggeredBy: 'absence',
    studentId:   student.studentId,
    busId,
  })
}


export async function notifyTripStarted({ student, busId, routeName, direction }) {
  if (!student.phone) return
  return sendSMS({
    to: student.phone,
    message: `BusNest: Bus ${busId} has started the ${String(direction).toUpperCase()} trip${routeName ? ` on ${routeName}` : ''}. ${student.name}'s journey is now active.`,
    recipient: student.parent || student.name,
    triggeredBy: 'trip_started', studentId: student.studentId, busId,
  })
}

export async function notifyMissedPickup({ student, busId, stopName, nextStop }) {
  if (!student.phone) return
  return sendSMS({
    to: student.phone,
    message: `BusNest urgent: Bus ${busId} left ${stopName} and ${student.name} did not board. Please proceed safely to ${nextStop || 'the next approved stop'} and contact the driver/school. Updates will continue until boarding is confirmed.`,
    recipient: student.parent || student.name,
    triggeredBy: 'missed_pickup', studentId: student.studentId, busId,
  })
}

export async function notifyMissedDropoff({ student, busId, stopName }) {
  if (!student.phone) return
  return sendSMS({
    to: student.phone,
    message: `BusNest alert: ${student.name} is still marked onboard after bus ${busId} passed ${stopName}. The driver has been alerted.`,
    recipient: student.parent || student.name,
    triggeredBy: 'missed_dropoff', studentId: student.studentId, busId,
  })
}

// Auto-trigger: bus near drop-off stop (evening) — tell parent to come receive child
export async function notifyBusNearDropoff({ student, busId, minutesAway, stopName }) {
  if (!student.phone) return
  const message = `BusNest: Bus ${busId} is ${minutesAway} minute${minutesAway !== 1 ? 's' : ''} away from ${stopName}. Please come outside to receive ${student.name}.`
  return sendSMS({
    to:          student.phone,
    message,
    recipient:   student.parent || student.name,
    triggeredBy: 'geofence_dropoff',
    studentId:   student.studentId,
    busId,
  })
}
