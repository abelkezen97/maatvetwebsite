# Connecting Google Sheets & Forms (No Google Cloud Required)

This guide provides instructions to connect the MAAT Sales Portal directly to Google Sheets using a **Google Form POST request** (for products) and a published Google Sheet (for reading products and customers). This requires **no Google Cloud accounts, no service accounts, and no credentials**.

---

## Part 1: Product Catalog Setup (Sheet & Form)

### Step 1: Create your Google Form
1. Go to [Google Forms](https://forms.google.com) and create a new form.
2. Add two fields in this exact order:
   * **Medicine Name** (Short Answer / Text)
   * **Unit Price** (Short Answer / Text)

### Step 2: Link the Form to a Google Sheet
1. In your Google Form editor, go to the **Responses** tab.
2. Click the green **Link to Sheets** button.
3. This creates a Google Sheet with columns:
   `Timestamp` | `Medicine Name` | `Unit Price`

### Step 3: Publish the Sheet to Web (For Reading)
To allow the Sales Portal to read the inventory dynamically:
1. Open the Google Sheet.
2. Go to **File** > **Share** > **Publish to web**.
3. Select **Entire Document** and **Web Page** (or **Comma-separated values (.csv)**), then click **Publish**.
4. Copy the **Spreadsheet ID** from the sheet's browser URL bar:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SPREADSHEET_ID_HERE`**`/edit#gid=0`

---

## Part 2: Customer List Setup (Sheet Only)

To sync your client/customer directory dynamically:

### Step 1: Create your Customer Google Sheet
1. Create a brand new Google Sheet.
2. Setup three columns in the first row (headers):
   * **Name** (representing the Clinic / Farm Company name)
   * **Location** (representing the address/region)
   * **Phone Number** (you can keep the values in this column blank for now)

### Step 2: Publish the Customer Sheet to Web
1. Inside your Customer Google Sheet, go to **File** > **Share** > **Publish to web**.
2. Select **Entire Document** and click **Publish**.
3. Copy the **Customers Spreadsheet ID** from the browser URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_CUSTOMERS_SPREADSHEET_ID_HERE`**`/edit#gid=0`

---

## Part 3: Configure Environment Variables

Create or open the file **`.env.local`** in the root directory of the project (`/Users/abelkezen/Documents/MAATWEB/.env.local`) and configure these values:

```env
# 1. Product Catalog Spreadsheet ID (For reading catalog)
NEXT_PUBLIC_SPREADSHEET_ID="your_product_spreadsheet_id_here"

# 2. Customers Directory Spreadsheet ID (For reading customers list)
NEXT_PUBLIC_CUSTOMERS_SPREADSHEET_ID="your_customers_spreadsheet_id_here"

# 3. Form ID (For writing manually added products back to Google Form)
GOOGLE_FORM_ID="1FAIpQLSfXXXXXXXXXXXXX"

# 4. Form input field entry IDs
GOOGLE_FORM_ENTRY_NAME="entry.12345"
GOOGLE_FORM_ENTRY_PRICE="entry.11111"
```

Once configured, the portal will dynamically pull both your medicine catalog and clinic client list straight from your Google Sheets in real time!
