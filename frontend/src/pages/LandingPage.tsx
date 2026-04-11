import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  Lock, 
  Activity, 
  Database, 
  Key, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Server, 
  AlertTriangle,
  ChevronRight,
  BrainCircuit
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-xl font-bold tracking-tight">Sentinel</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#docs" className="hover:text-white transition-colors">Documentation</a>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/signin" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Sign In</Link>
            <Link to="/signup" className="text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)]">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* 1. HERO SECTION */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 max-w-7xl mx-auto">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="text-center max-w-4xl mx-auto relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span>Sentinel Core 2.0 is now live</span>
              </span>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
                Secure Your AI Infrastructure with Sentinel-Core: <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 to-cyan-400">The Intelligent Firewall for the LLM Era.</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-3xl mx-auto">
                Stop prompt injections, redact PII, and automate threat mitigation before they reach your models. One line of code for enterprise-grade AI security.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <Link to="/signup" className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-4 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]">
                  <span>Start Free</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/app" className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-8 py-4 rounded-lg font-medium transition-all">
                  <Activity className="w-4 h-4" />
                  <span>View Dashboard Demo</span>
                </Link>
              </div>
            </motion.div>

            {/* Hero Visual Mockup */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-20 relative mx-auto max-w-5xl"
            >
              <div className="rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="h-12 border-b border-white/5 bg-slate-950/50 flex items-center px-4 space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Threats Blocked</span>
                      <Shield className="w-4 h-4 text-blocked" />
                    </div>
                    <div className="text-3xl font-bold">14,205</div>
                    <div className="text-xs text-blocked mt-1">+12% this week</div>
                  </div>
                  <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Security Score</span>
                      <Activity className="w-4 h-4 text-clean" />
                    </div>
                    <div className="text-3xl font-bold text-clean">98/100</div>
                    <div className="text-xs text-slate-500 mt-1">System Secure</div>
                  </div>
                  <div className="bg-slate-950/50 border border-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Live Logs</span>
                      <Database className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-500">10:42:01</span>
                        <span className="text-blocked bg-blocked/10 px-2 py-0.5 rounded">BLOCKED</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-500">10:41:55</span>
                        <span className="text-clean bg-clean/10 px-2 py-0.5 rounded">CLEAN</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 2. TRUST / PROBLEM SECTION */}
        <section className="py-24 bg-slate-950 border-y border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">AI apps are vulnerable.</h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Without a security layer, your LLM applications are exposed to critical vulnerabilities that can compromise data and system integrity.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:bg-slate-900/60 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-blocked/10 flex items-center justify-center mb-4 border border-blocked/20">
                  <AlertTriangle className="w-6 h-6 text-blocked" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Prompt Injection</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Attackers use malicious inputs to override system instructions, bypassing constraints and hijacking your AI model's behavior.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:bg-slate-900/60 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center mb-4 border border-warning/20">
                  <Database className="w-6 h-6 text-warning" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Sensitive Data Leaks</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Users inadvertently or maliciously extract PII, API keys, or proprietary training data from your AI applications.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-6 backdrop-blur-sm hover:bg-slate-900/60 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                  <Activity className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Malicious Automation</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Bots and automated scripts exploit your AI endpoints to generate spam, phishing content, or perform reconnaissance.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. HOW IT WORKS */}
        <section id="how-it-works" className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Sentinel Works</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Sentinel acts as an intelligent security middleware, scanning every prompt in real-time before it reaches your AI model.
            </p>
          </div>

          <div className="relative max-w-4xl mx-auto">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-linear-to-r from-slate-800 via-indigo-500/50 to-slate-800 -translate-y-1/2 z-0" />
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center mb-4 shadow-lg">
                  <Server className="w-6 h-6 text-slate-300" />
                </div>
                <h4 className="font-semibold mb-2">User Prompt</h4>
                <p className="text-xs text-slate-400">Raw input from your application users.</p>
              </div>
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  <Shield className="w-6 h-6 text-indigo-400" />
                </div>
                <h4 className="font-semibold mb-2">Sentinel Scan</h4>
                <p className="text-xs text-slate-400">Real-time threat detection and redaction.</p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-clean/10 border border-clean/30 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(50,255,126,0.1)]">
                  <CheckCircle2 className="w-6 h-6 text-clean" />
                </div>
                <h4 className="font-semibold mb-2">Sanitized Prompt</h4>
                <p className="text-xs text-slate-400">Clean, safe prompt ready for processing.</p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center mb-4 shadow-lg">
                  <BrainCircuit className="w-6 h-6 text-cyan-400" />
                </div>
                <h4 className="font-semibold mb-2">AI Model</h4>
                <p className="text-xs text-slate-400">Safe execution by your chosen LLM.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. FEATURES SECTION */}
        <section id="features" className="py-24 bg-slate-900/30 border-y border-white/5">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise-Grade Protection</h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Everything you need to secure your AI infrastructure in one platform.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { icon: Shield, title: 'Injection Guard', desc: 'Real-time scanning of every incoming prompt for malicious intent.', benefit: 'Prevents jailbreaks and system overrides.' },
                { icon: Lock, title: 'Privacy Shield', desc: 'Automatically detects and masks PII before it leaves your network.', benefit: 'Ensures HIPAA and GDPR compliance for AI.' },
                { icon: Layers, title: 'Universal SDK', desc: 'One-line integration for OpenAI, Anthropic, and local LLMs.', benefit: 'No vendor lock-in; switch models securely.' },
                { icon: Activity, title: 'Autonomous SOC', desc: 'AI agent that isolates servers and blocks IPs with 95% confidence.', benefit: 'Reduces time-to-remediate from hours to seconds.' },
              ].map((feature, i) => (
                <div key={i} className="group p-6 rounded-xl bg-slate-950/50 border border-white/5 hover:border-indigo-500/30 hover:bg-slate-900/80 transition-all duration-300">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
                      <feature.icon className="w-6 h-6 text-slate-400 group-hover:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed mb-3">{feature.desc}</p>
                      <div className="inline-flex items-center space-x-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-md border border-indigo-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{feature.benefit}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. DASHBOARD PREVIEW */}
        <section className="py-32 px-6 max-w-7xl mx-auto overflow-hidden">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2 space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">Deep visibility into your AI traffic.</h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                The Sentinel Dashboard gives you unprecedented insight into how your AI models are being used, what threats are being blocked, and where vulnerabilities might exist.
              </p>
              <ul className="space-y-4 pt-4">
                {[
                  'Real-time threat analytics and scoring',
                  'Detailed security logs with raw payload inspection',
                  'Granular API key usage monitoring',
                  'Live AI reasoning and chain-of-thought visibility'
                ].map((item, i) => (
                  <li key={i} className="flex items-start space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-clean shrink-0 mt-0.5" />
                    <span className="text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-6">
                <Link to="/app" className="inline-flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  <span>Explore the Dashboard</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="lg:w-1/2 relative">
              <div className="absolute inset-0 bg-linear-to-tr from-indigo-500/20 to-cyan-500/20 blur-[80px] -z-10" />
              <div className="rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-2 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <img 
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop" 
                  alt="Dashboard Preview" 
                  className="rounded-lg opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 7. SECURITY BENEFITS */}
        <section className="py-20 bg-indigo-950/20 border-y border-indigo-500/10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">99.9%</div>
                <div className="text-indigo-300 font-medium">Threat Detection Rate</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">&lt;50ms</div>
                <div className="text-indigo-300 font-medium">Added Scan Latency</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">250M+</div>
                <div className="text-indigo-300 font-medium">Prompts Protected</div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. PRICING TABLE */}
        <section id="pricing" className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Start securing your AI applications today. Scale as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Tier */}
            <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-8 flex flex-col">
              <h3 className="text-xl font-semibold text-slate-200 mb-2">FREE</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-slate-400 ml-2">/month</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>1,000 AI requests</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Basic prompt scanning</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Security logs</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Single API key</span></li>
              </ul>
              <Link to="/signup" className="w-full py-3 px-4 rounded-lg border border-white/10 text-center font-medium hover:bg-slate-800 transition-colors">
                Start Free
              </Link>
            </div>

            {/* Pro Tier */}
            <div className="bg-slate-900 border-2 border-indigo-500 rounded-2xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold text-indigo-300 mb-2">PRO</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-bold text-white">$19</span>
                <span className="text-slate-400 ml-2">/month</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>50,000 requests</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Advanced prompt injection detection</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>PII data redaction</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Threat analytics dashboard</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Priority scanning</span></li>
              </ul>
              <Link to="/signup" className="w-full py-3 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-center font-medium transition-colors shadow-lg">
                Upgrade to Pro
              </Link>
            </div>

            {/* Business Tier */}
            <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-8 flex flex-col">
              <h3 className="text-xl font-semibold text-slate-200 mb-2">BUSINESS</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-bold text-white">$49</span>
                <span className="text-slate-400 ml-2">/month</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Unlimited requests</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Deep AI threat analysis</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Team dashboard</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Multiple API keys</span></li>
                <li className="flex items-start space-x-3 text-sm text-slate-300"><CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5" /><span>Priority support</span></li>
              </ul>
              <Link to="/signup" className="w-full py-3 px-4 rounded-lg border border-white/10 text-center font-medium hover:bg-slate-800 transition-colors">
                Start Business Plan
              </Link>
            </div>
          </div>
        </section>

        {/* 8. FINAL CTA */}
        <section className="py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-indigo-900/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-64 bg-indigo-500/20 blur-[100px] rounded-full" />
          
          <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Secure Your AI Before It's Too Late</h2>
            <p className="text-xl text-slate-300 mb-10">
              Join thousands of developers building safe, secure, and reliable AI applications with Sentinel.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Link to="/signup" className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-4 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]">
                Start Free
              </Link>
              <Link to="/docs" className="w-full sm:w-auto bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-8 py-4 rounded-lg font-medium transition-all">
                View Documentation
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 9. FOOTER */}
      <footer className="bg-slate-950 border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="w-5 h-5 text-indigo-400" />
              <span className="text-lg font-bold tracking-tight">Sentinel</span>
            </div>
            <p className="text-sm text-slate-500">
              The Firewall for AI Applications. Securing the next generation of software.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-slate-200 mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-indigo-400 transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-indigo-400 transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Changelog</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-slate-200 mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Security Blog</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-slate-200 mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-12 pt-8 border-t border-white/5 text-sm text-slate-600 flex flex-col md:flex-row justify-between items-center">
          <p>© {new Date().getFullYear()} Sentinel Security Inc. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-clean" />
              <span>All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
