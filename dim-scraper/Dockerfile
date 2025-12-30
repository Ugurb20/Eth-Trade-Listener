# Dimension Table Scraper Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Copy calldata slice rules JSON
COPY calldata_slice_rules.json ./

# Build TypeScript
RUN npm run build

# Run the scraper
CMD ["npm", "start"]
