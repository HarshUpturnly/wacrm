export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-6">
        This Privacy Policy explains how we collect, use, disclose, and protect your information when you use the WACRM service.
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Information we collect</h2>
        <ul className="list-disc pl-5 text-sm">
          <li>Account information (name, email) you provide when signing up.</li>
          <li>Workspace and profile data such as contacts, messages and settings.</li>
          <li>Service logs and metadata (for diagnostics and security).</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">How we use information</h2>
        <p className="text-sm">
          We use the information to operate, maintain, and provide the features of the service, to improve the
          product, to provide support, and to comply with legal obligations. For example, inbound messages are
          stored to provide a shared inbox and to support automations and replies.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Third-party services</h2>
        <p className="text-sm">
          We use third-party services such as Supabase for data storage and Meta (Facebook) APIs for WhatsApp and
          Instagram integrations. Those services have their own privacy policies; by using our service you
          acknowledge and agree that data may be transmitted to and processed by those providers.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Cookies and tracking</h2>
        <p className="text-sm">
          We use cookies and similar technologies for authentication, session management, and analytics. You can
          control cookies through your browser settings; disabling certain cookies could affect the site's
          functionality.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Data retention</h2>
        <p className="text-sm">
          We retain data for as long as necessary to provide the service, fulfill legal obligations, resolve
          disputes, and enforce our agreements. Workspace owners may request deletion of their account and data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Your rights</h2>
        <p className="text-sm">
          Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal
          data. To exercise these rights contact the workspace administrator or the email below.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">Contact</h2>
        <p className="text-sm">
          For privacy questions or requests, contact: <strong>privacy@your-domain.example</strong>.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">Last updated: 2026-08-15</p>
    </div>
  );
}
