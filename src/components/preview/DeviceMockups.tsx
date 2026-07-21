"use client";

type DeviceMockupsProps = {
  mobile?: React.ReactNode;
  desktop?: React.ReactNode;
};

export default function DeviceMockups({ mobile, desktop }: DeviceMockupsProps) {
  return (
    <main className="mockup-stage">
      <section className="device-card">
        <div className="iphone-mockup">
          <span className="iphone-button iphone-button--left-top" />
          <span className="iphone-button iphone-button--left-middle" />
          <span className="iphone-button iphone-button--left-bottom" />
          <span className="iphone-button iphone-button--right" />
          <div className="iphone-screen">
            <div className="dynamic-island" />
            {mobile}
          </div>
        </div>
      </section>
      <section className="device-card">
        <div className="desktop-mockup">
          <div className="desktop-camera" />
          <div className="desktop-screen">
            {desktop}
          </div>
        </div>
      </section>
    </main>
  );
}
