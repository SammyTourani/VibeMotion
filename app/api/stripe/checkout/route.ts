import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY

  // If Stripe not configured, return a graceful mock response
  if (!stripeKey || stripeKey === 'sk_test_placeholder' || stripeKey === 'your-stripe-secret-key') {
    return NextResponse.json({
      url: '/pricing?upgraded=preview',
      mock: true,
      message: 'Stripe not configured — set STRIPE_SECRET_KEY to enable payments',
    })
  }

  try {
    // Dynamic import so Stripe doesn't break builds without the key
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeKey)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRO_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session', url: '/pricing' },
      { status: 500 }
    )
  }
}
