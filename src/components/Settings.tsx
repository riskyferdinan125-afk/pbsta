import React, { useState } from 'react';
import { Settings as SettingsIcon, Shield, Bell, Database, Globe, ChevronLeft, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Settings() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = [
    {
      id: 'system',
      title: 'System Configuration',
      icon: Database,
      description: 'Manage database backups, retention policies, and system-wide defaults.',
      items: ['Database Backup', 'Auto-Archive Tickets', 'Default Priority']
    },
    {
      id: 'security',
      title: 'Security & Access',
      icon: Shield,
      description: 'Configure multi-factor authentication, IP whitelisting, and role permissions.',
      items: ['MFA Settings', 'IP Access Control', 'Audit Logs']
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      description: 'Set up email, SMS, and push notification templates for ticket updates.',
      items: ['Email Templates', 'SMS Gateway', 'Push Notifications']
    },
    {
      id: 'localization',
      title: 'Localization',
      icon: Globe,
      description: 'Change system language, timezone, and currency formats.',
      items: ['Language', 'Timezone', 'Currency']
    },
    {
      id: 'integrations',
      title: 'Integrations',
      icon: Send,
      description: 'Connect with external services like Telegram for automated notifications.',
      items: ['Telegram Bot Settings', 'Email Gateway', 'API Access']
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">System Settings</h1>
          <p className="text-neutral-500">Configure global application parameters and security.</p>
        </div>
        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
          <SettingsIcon className="w-6 h-6" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, idx) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-xl bg-neutral-100 text-neutral-600">
                <section.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{section.title}</h3>
                <p className="text-sm text-neutral-500">{section.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              {section.items.map(item => (
                <div
                  key={item}
                  className="w-full text-left px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                >
                  {item}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex items-start gap-4">
        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-orange-900">Superadmin Access Only</h4>
          <p className="text-sm text-orange-800">
            These settings are critical for system stability. Only users with the <strong>Superadmin</strong> role can modify these parameters.
          </p>
        </div>
      </div>
    </div>
  );
}
