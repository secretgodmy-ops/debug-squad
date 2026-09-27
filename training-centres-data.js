// Seed data for training centres in Trichy.
// server.js upserts these into MongoDB (matched by `name`) every time it connects,
// so edit this file and restart the server to update the stored data.

function mapsUrl(name, address, pincode) {
  const query = `${name}, ${address}, Trichy ${pincode}`;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

const raw = [
  {
    name: 'Galwin Technology',
    address: '3rd Floor, Periyasamy Towers, Near Chathiram Bus Stand, Chinnakadai Street',
    area: 'Chathiram',
    pincode: '620002',
    established: 2016,
    courses: ['Python', 'Java', 'Web Development', 'Full Stack Development', 'Data Science', 'Student Project Guidance'],
    email: 'contact@galwintechnologies.com',
    phones: ['+91 97867 14442'],
    imageUrl: null
  },
  {
    name: 'T4TEQ Software Solutions',
    address: 'Puthur Main Road, Near Bishop Heber College / Puthur Four Road',
    area: 'Puthur',
    pincode: '620017',
    established: 2018,
    courses: ['Data Science', 'Artificial Intelligence & ML', 'Power BI', 'Python', 'UI/UX Design'],
    email: 'info@t4teq.com',
    phones: ['+91 74485 46220'],
    imageUrl: null
  },
  {
    name: 'Livewire Trichy (Chathiram Branch)',
    address: 'No 1 C, Ranga Complex, 2nd Floor, Near Ramba Cinema, Old Karur Road, Mela Chintamani',
    area: 'Mela Chintamani',
    pincode: '620002',
    established: 2019,
    courses: ['Data Science', 'Artificial Intelligence', 'Python Programming', 'Industrial Automation', 'Cyber Security'],
    email: 'info@livewiretrichy.com',
    phones: ['+91 82202 50333', '+91 70417 80450'],
    imageUrl: null
  },
  {
    name: 'Marcello Tech',
    address: 'Sankaranpillai Road, Mela Chintamani',
    area: 'Mela Chintamani',
    pincode: '620002',
    established: 2015,
    courses: ['Machine Learning & AI', 'IoT (Internet of Things)', 'Embedded Systems', 'Web Development (Angular/React)', 'Robotics'],
    email: 'info@marcellotech.com',
    phones: ['+91 94423 44796', '+91 99406 58158'],
    imageUrl: null
  },
  {
    name: 'Entrust Technology',
    address: '3rd Floor, TABS Complex, Opposite American Hospital',
    area: 'Cantonment',
    pincode: '620001',
    established: 2014,
    courses: ['Python', 'Java Full Stack', 'Software Testing', 'Web Design & Development', 'Cloud Computing'],
    email: 'info@entrusttechnology.in',
    phones: ['+91 94455 50437'],
    imageUrl: 'https://www.justdial.com/Trichy/Entrust-Technology'
  },
  {
    name: 'METS Computer Education',
    address: '2nd Floor, Chitra Complex, Chathiram Bus Stand, Mela Chintamani',
    area: 'Mela Chintamani',
    pincode: '620002',
    established: 2010,
    courses: ['Tally Prime with GST', 'MS Office', 'C/C++', 'Web Designing', 'Hardware & Networking'],
    email: 'enquiry@metscomputer.com',
    phones: ['+91 76391 12514'],
    imageUrl: 'https://www.justdial.com/Trichy/METS-Computer-Education'
  },
  {
    name: 'Soft and Soft Computers',
    address: '141, Pudukkottai Main Road, Near Bus Stop',
    area: 'Subramaniapuram',
    pincode: '620020',
    established: 2008,
    courses: ['Software Development', 'Python', 'C/C++ Programming', 'Database Management (SQL)', 'Tally'],
    email: 'info@softandsoft.in',
    phones: ['+91 88258 54541'],
    imageUrl: 'https://www.justdial.com/Trichy/Soft-And-Soft-Computers'
  },
  {
    name: 'CADD Centre (No. 1 Tollgate Branch)',
    address: 'Ragavendra Nagar, Bikshandarkoil, No. 1 Tollgate',
    area: 'No. 1 Tollgate',
    pincode: '621216',
    established: 2012,
    courses: ['AutoCAD', 'SolidWorks', 'CATIA', 'Architectural Design', 'Civil/Mechanical Design Software'],
    email: 'trichy.tollgate@caddcentre.com',
    phones: ['+91 94433 12345'],
    imageUrl: 'https://www.justdial.com/Trichy/CADD-Centre-No-1-Tollgate'
  }
];

const trainingCentres = raw.map((c) => ({
  ...c,
  city: 'Trichy',
  directionsUrl: mapsUrl(c.name, c.address, c.pincode)
}));

module.exports = { trainingCentres };
