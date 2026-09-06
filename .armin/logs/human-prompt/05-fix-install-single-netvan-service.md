# Fix Install Single Netvan Service

Date and time: 2026-09-06 10:57:00

## Prompt

1. Fix the error
PS C:\Users\armin\GitHub\netvan\.armin\deploy\local-windows> .\install.ps1
Exception: C:\Users\armin\GitHub\netvan\.armin\deploy\local-windows\install.ps1:228
Line |
 228 |    throw "Expected API at $ApiRoot"
     |    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     | Expected API at C:\Users\armin\GitHub\netvan\.armin\netvan-api
2. it must run both api and webui as a single service named Netvan
