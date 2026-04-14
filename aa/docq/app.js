document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const loader = document.getElementById('loader');
    const btnText = loginBtn.querySelector('span');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Visual feedback: Start loading
        setLoading(true);

        const payload = {
            "request": "dashboard",
            "user": {
                "email": email,
                "password": password
            }
        };

        try {
            const response = await fetch('https://playground.n8n.md.chula.ac.th/webhook/docqadmin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            // Log result to devconsole as requested
            console.log('n8n Response:', result);

            // Successfully received dashboard data
            if (result && result.length > 0 && result[0].courses) {
                initDashboard(result[0]);
            } else {
                alert('ไม่พบข้อมูล Dashboard สำหรับผู้ใช้นี้ หรือการ Login ผิดพลาด');
            }

        } catch (error) {
            console.error('Login Error:', error);
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
        } finally {
            // Visual feedback: End loading
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            loginBtn.disabled = true;
            loader.style.display = 'block';
            btnText.textContent = 'Logging in...';
        } else {
            loginBtn.disabled = false;
            loader.style.display = 'none';
            btnText.textContent = 'Login';
        }
    }
});
