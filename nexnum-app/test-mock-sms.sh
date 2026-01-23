
# 1. Get Balance
echo "1. Getting Balance..."
curl "http://localhost:3000/api/mock-sms?action=getBalance"
echo -e "\n"

# 2. Get Countries (First 100 bytes)
echo "2. Getting Countries..."
curl "http://localhost:3000/api/mock-sms?action=getCountries" | head -c 100
echo -e "\n..."

# 3. Buy Number (US WhatsApp)
echo "3. Buying Number (US WhatsApp)..."
RESPONSE=$(curl -s "http://localhost:3000/api/mock-sms?action=getNumber&country=187&service=wa")
echo "Response: $RESPONSE"

if [[ $RESPONSE == ACCESS_NUMBER* ]]; then
    ID=$(echo $RESPONSE | cut -d':' -f2)
    PHONE=$(echo $RESPONSE | cut -d':' -f3)
    echo "Parsed ID: $ID, Phone: $PHONE"
    
    # 4. Check Status (Should be WAIT initially)
    echo "4. Checking Status..."
    curl "http://localhost:3000/api/mock-sms?action=getStatus&id=$ID"
    echo -e "\n"
    
    echo "Wait 15s for SMS simulation..."
    sleep 15
    
    # 5. Check Status Again (Should receive code)
    echo "5. Checking Status Again..."
    STATUS_RESP=$(curl -s "http://localhost:3000/api/mock-sms?action=getStatus&id=$ID")
    echo "Response: $STATUS_RESP"
    
    # 6. Complete Activation
    echo "6. Completing Activation..."
    curl "http://localhost:3000/api/mock-sms?action=setStatus&status=6&id=$ID"
    echo -e "\n"
else
    echo "Purchase failed."
fi
