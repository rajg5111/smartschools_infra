# Use the official AWS Lambda Node.js runtime as base image
FROM public.ecr.aws/lambda/nodejs:22

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy function code
COPY src/ ./

# Set the CMD to your handler
CMD [ "index.handler" ]