"use client";

import { motion } from "framer-motion";

const technologies = [
  {
    name: "Remotion",
    description: "React-based video rendering",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z" />
        <circle cx="16" cy="16" r="6" />
      </svg>
    ),
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    name: "Claude AI",
    description: "Advanced AI code generation",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <path d="M16 4c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4zm0 22c-5.514 0-10-4.486-10-10S10.486 6 16 6s10 4.486 10 10-4.486 10-10 10z" />
        <path d="M16 10a6 6 0 100 12 6 6 0 000-12zm0 10a4 4 0 110-8 4 4 0 010 8z" />
      </svg>
    ),
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
  {
    name: "TypeScript",
    description: "Type-safe video compositions",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <rect x="2" y="2" width="28" height="28" rx="3" />
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          fill="black"
        >
          TS
        </text>
      </svg>
    ),
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    name: "React",
    description: "Component-based video UI",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <circle cx="16" cy="16" r="3" />
        <ellipse
          cx="16"
          cy="16"
          rx="12"
          ry="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <ellipse
          cx="16"
          cy="16"
          rx="12"
          ry="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          transform="rotate(60 16 16)"
        />
        <ellipse
          cx="16"
          cy="16"
          rx="12"
          ry="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          transform="rotate(120 16 16)"
        />
      </svg>
    ),
    color: "text-cyan-300",
    bgColor: "bg-cyan-400/10",
    borderColor: "border-cyan-400/20",
  },
  {
    name: "ElevenLabs",
    description: "AI voice & sound effects",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <rect x="6" y="12" width="3" height="8" rx="1" />
        <rect x="11" y="8" width="3" height="16" rx="1" />
        <rect x="16" y="10" width="3" height="12" rx="1" />
        <rect x="21" y="6" width="3" height="20" rx="1" />
      </svg>
    ),
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  {
    name: "Replicate",
    description: "AI image generation",
    logo: (
      <svg viewBox="0 0 32 32" className="w-10 h-10" fill="currentColor">
        <path d="M8 8h6v6H8zM18 8h6v6h-6zM8 18h6v6H8zM18 18h6v6h-6z" />
      </svg>
    ),
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
];

export default function TechStack() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900/30 to-black" />

      <div className="relative max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-6"
          >
            Built With
          </motion.span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Powered by Best-in-Class Technology
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Industry-leading tools combined to give you professional video
            creation capabilities.
          </p>
        </motion.div>

        {/* Tech grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          {technologies.map((tech, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`group relative p-6 rounded-2xl ${tech.bgColor} border ${tech.borderColor} hover:scale-[1.02] transition-transform`}
            >
              <div className={`${tech.color} mb-4 group-hover:scale-110 transition-transform`}>
                {tech.logo}
              </div>
              <h3 className="text-white font-semibold mb-1">{tech.name}</h3>
              <p className="text-sm text-gray-500">{tech.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
