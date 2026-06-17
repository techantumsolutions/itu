'use client'

import { useEffect, useRef } from 'react'

export function ConfettiCelebration() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const colors = [
      '#f59e0b', // amber
      '#f97316', // orange
      '#ef4444', // red
      '#ec4899', // pink
      '#a855f7', // purple
      '#3b82f6', // blue
      '#10b981', // emerald
      '#eab308', // yellow
    ]

    class Particle {
      x: number
      y: number
      size: number
      color: string
      vx: number
      vy: number
      rotation: number
      rotationSpeed: number
      opacity: number
      decay: number

      constructor() {
        // Start from bottom center
        this.x = width / 2
        this.y = height + 10
        this.size = Math.random() * 8 + 6
        this.color = colors[Math.floor(Math.random() * colors.length)]
        
        // Explode upwards and outwards
        const angle = Math.random() * Math.PI - Math.PI // upper semicircle
        const speed = Math.random() * 16 + 14
        this.vx = Math.cos(angle) * speed * (Math.random() * 0.7 + 0.3)
        this.vy = Math.sin(angle) * speed - 8 // strong upward force

        this.rotation = Math.random() * 360
        this.rotationSpeed = Math.random() * 12 - 6
        this.opacity = 1.0
        this.decay = Math.random() * 0.012 + 0.006
      }

      update() {
        this.x += this.vx
        this.y += this.vy
        this.vy += 0.52 // gravity
        this.vx *= 0.982 // air resistance
        this.rotation += this.rotationSpeed
        this.opacity -= this.decay
      }

      draw(c: CanvasRenderingContext2D) {
        c.save()
        c.translate(this.x, this.y)
        c.rotate((this.rotation * Math.PI) / 180)
        c.globalAlpha = Math.max(0, this.opacity)
        c.fillStyle = this.color
        
        // Randomly draw a square or circle or rectangle
        if (this.size % 3 === 0) {
          c.fillRect(-this.size / 2, -this.size / 2, this.size, this.size)
        } else if (this.size % 3 === 1) {
          c.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2)
        } else {
          c.beginPath()
          c.arc(0, 0, this.size / 2, 0, Math.PI * 2)
          c.fill()
        }
        c.restore()
      }
    }

    const particles: Particle[] = []
    
    // Initial burst
    for (let i = 0; i < 140; i++) {
      particles.push(new Particle())
    }

    // Keep adding a few particles for the first 800ms to prolong celebration feel
    let timeElapsed = 0
    const addMoreInterval = setInterval(() => {
      timeElapsed += 100
      if (timeElapsed < 800) {
        for (let i = 0; i < 12; i++) {
          particles.push(new Particle())
        }
      } else {
        clearInterval(addMoreInterval)
      }
    }, 100)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.update()
        p.draw(ctx)

        if (p.opacity <= 0 || p.y > height + 20) {
          particles.splice(i, 1)
        }
      }

      if (particles.length > 0) {
        animationId = requestAnimationFrame(animate)
      }
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      clearInterval(addMoreInterval)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  )
}
