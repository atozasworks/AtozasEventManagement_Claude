// Demo listings for the vendor marketplace. Phone numbers are made up; the contact email is the
// owner's own address, so every request for a demo listing reaches the account that owns it.
export function demoVendors(owner) {
  const contact = (n) => ({ phone: `+9198000001${n}`, whatsapp: `+9198000001${n}`, email: owner.email });
  const base = { owner: owner._id, currency: 'INR' };
  return [
    {
      ...base, category: 'marriage-hall', name: 'Sri Lakshmi Kalyana Mantapa', city: 'Bengaluru', state: 'Karnataka', address: 'Jayanagar 4th Block',
      tagline: 'Traditional AC wedding hall with dining for 600 and parking for 150 cars',
      description: 'A full-day booking covers the main hall, dining hall, two bridal rooms and the kitchen. Generator backup throughout. Outside caterers and decorators are welcome.',
      capacityMin: 300, capacityMax: 1200, priceFrom: 250000, priceUnit: 'per-day', services: ['AC hall', 'Dining hall', 'Parking', 'Bridal rooms', 'Generator backup', 'Kitchen'],
      contact: contact('01'), bookingsPerDay: 1, visitTypes: ['site-visit'],
    },
    {
      ...base, category: 'marriage-hall', name: 'Royal Orchid Convention Hall', city: 'Mysuru', state: 'Karnataka', address: 'Hunsur Road',
      tagline: 'Pillar-less banquet hall with a lawn for receptions',
      description: 'Indoor hall for 800 plus an open lawn for 500. In-house sound and lighting. Rooms for 40 guests on site.',
      capacityMin: 200, capacityMax: 800, priceFrom: 180000, priceUnit: 'per-day', services: ['Banquet hall', 'Lawn', 'Guest rooms', 'Sound & lights', 'Valet parking'],
      contact: contact('02'), bookingsPerDay: 1, visitTypes: ['site-visit'],
    },
    {
      ...base, category: 'marriage-hall', name: 'Sea Breeze Party Lawn', city: 'Mumbai', state: 'Maharashtra', address: 'Juhu',
      tagline: 'Sea-facing lawn for evening weddings and sangeets',
      description: 'Open-air venue with a stage, green rooms and a covered buffet area. Music allowed until 10 pm.',
      capacityMin: 100, capacityMax: 500, priceFrom: 400000, priceUnit: 'per-day', services: ['Sea view', 'Stage', 'Green rooms', 'Buffet area'],
      contact: contact('03'), bookingsPerDay: 1, visitTypes: ['site-visit'], instantBooking: true,
    },
    {
      ...base, category: 'caterer', name: 'Annapoorna Caterers', city: 'Bengaluru', state: 'Karnataka',
      tagline: 'South Indian wedding meals served on banana leaf',
      description: 'Pure vegetarian. Traditional Karnataka and Tamil wedding menus, live dosa and chaat counters, filter coffee. Serving staff and banana leaves included.',
      capacityMin: 100, capacityMax: 3000, priceFrom: 450, priceUnit: 'per-plate', services: ['Pure veg', 'Banana leaf service', 'Live counters', 'Serving staff', 'Jain food on request'],
      contact: contact('04'), bookingsPerDay: 3, visitTypes: ['tasting', 'meeting'],
    },
    {
      ...base, category: 'caterer', name: 'Spice Route Catering', city: 'Mumbai', state: 'Maharashtra',
      tagline: 'Multi-cuisine buffets: North Indian, coastal and continental',
      description: 'Veg and non-veg buffets with live grills and dessert bars. Crockery, cutlery and uniformed staff included.',
      capacityMin: 50, capacityMax: 1500, priceFrom: 900, priceUnit: 'per-plate', services: ['Veg & non-veg', 'Live grill', 'Dessert bar', 'Crockery included'],
      contact: contact('05'), bookingsPerDay: 2, visitTypes: ['tasting'],
    },
    {
      ...base, category: 'event-planner', name: 'Mangalam Wedding Planners', city: 'Bengaluru', state: 'Karnataka',
      tagline: 'End-to-end wedding planning, from muhurtham to reception',
      description: 'One team for venue shortlisting, vendor management, guest logistics and day-of coordination. Fixed fee, no vendor commissions.',
      capacityMin: 0, capacityMax: 0, priceFrom: 150000, priceUnit: 'per-event', services: ['Full planning', 'Day-of coordination', 'Guest logistics', 'Budget tracking'],
      contact: contact('06'), bookingsPerDay: 2, visitTypes: ['meeting'],
    },
    {
      ...base, category: 'event-planner', name: 'Celebrate Hyderabad Events', city: 'Hyderabad', state: 'Telangana',
      tagline: 'Corporate events, engagements and destination weddings',
      description: 'Planning and production team with in-house stage design. Works across Telangana and Andhra Pradesh.',
      capacityMin: 0, capacityMax: 0, priceFrom: 90000, priceUnit: 'per-event', services: ['Corporate events', 'Destination weddings', 'Stage design'],
      contact: contact('07'), bookingsPerDay: 2, visitTypes: ['meeting'],
    },
    {
      ...base, category: 'decorator', name: 'Pushpa Flower Decor', city: 'Bengaluru', state: 'Karnataka',
      tagline: 'Fresh-flower mantapa and stage decoration',
      description: 'Mantapa, entrance arch, stage backdrop and car decoration using fresh jasmine, marigold and roses. Setup and removal included.',
      capacityMin: 0, capacityMax: 0, priceFrom: 60000, priceUnit: 'per-event', services: ['Mantapa decor', 'Stage backdrop', 'Entrance arch', 'Fresh flowers', 'Lighting'],
      contact: contact('08'), bookingsPerDay: 2, visitTypes: ['meeting', 'site-visit'],
    },
    {
      ...base, category: 'decorator', name: 'Dream Themes Decor', city: 'Mysuru', state: 'Karnataka',
      tagline: 'Theme stages, drapes and lighting for receptions',
      description: 'Custom themes with 3D design previews before you book. Works with any hall.',
      capacityMin: 0, capacityMax: 0, priceFrom: 45000, priceUnit: 'per-event', services: ['Theme stage', 'Drapes', 'LED lighting', '3D preview'],
      contact: contact('09'), bookingsPerDay: 1, visitTypes: ['meeting', 'site-visit'],
    },
    {
      ...base, category: 'photographer', name: 'Candid Frames Studio', city: 'Bengaluru', state: 'Karnataka',
      tagline: 'Candid wedding photography and cinematic films',
      description: 'Two photographers and one videographer for a full wedding day. Edited photos in 3 weeks, highlight film in 6.',
      capacityMin: 0, capacityMax: 0, priceFrom: 85000, priceUnit: 'per-event', services: ['Candid photos', 'Wedding film', 'Drone shots', 'Photo album'],
      contact: contact('10'), bookingsPerDay: 1, visitTypes: ['meeting'],
    },
    {
      ...base, category: 'photographer', name: 'Moments by Meera', city: 'Mumbai', state: 'Maharashtra',
      tagline: 'Pre-wedding shoots and small events',
      description: 'Solo photographer for engagements, pre-wedding shoots, birthdays and corporate portraits.',
      capacityMin: 0, capacityMax: 0, priceFrom: 6000, priceUnit: 'per-hour', services: ['Pre-wedding shoot', 'Engagements', 'Same-week delivery'],
      contact: contact('11'), bookingsPerDay: 2, visitTypes: ['meeting'], instantBooking: true,
    },
  ];
}
