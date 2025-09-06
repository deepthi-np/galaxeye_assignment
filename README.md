galaxeye_assignment/
├── docker-compose.yml
├── README.md
├── api/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── routes/
│       │   ├── upload.js
│       │   └── jobs.js
│       └── utils/
│           └── jobManager.js
├── web/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.js
│       ├── components/
│       │   ├── FileUpload.js
│       │   ├── MapView.js
│       │   ├── AOISelection.js
│       │   └── JobStatus.js
│       └── styles/
│           └── App.css
├── worker/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── worker.py
└── data/
    ├── uploads/
    └── outputs/
