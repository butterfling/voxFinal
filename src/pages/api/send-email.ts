import type { NextApiRequest, NextApiResponse } from 'next';
import { EmailTemplate } from '../../components/email-template';
import { Resend } from 'resend';

const resend = new Resend('re_GVhrHXrY_L9rUeESQmNsGVpCFfrYiRXzc');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, roomName, summaryUrl } = req.body;

    if (!email || !roomName || !summaryUrl) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    console.log('[DEBUG] Sending email with React template to:', email);

    const { data, error } = await resend.emails.send({
      from: 'VoxBridge <onboarding@resend.dev>',
      to: [email],
      subject: `Your VoxBridge Summary for ${roomName} is Ready`,
      react: EmailTemplate({ roomName, summaryUrl }),
    });

    if (error) {
      console.error('[DEBUG] Failed to send email:', error);
      return res.status(400).json(error);
    }

    console.log('[DEBUG] Email sent successfully:', data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[DEBUG] Error in email API route:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
