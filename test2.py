import urllib.request, json
r=json.loads(urllib.request.urlopen('http://127.0.0.1:5000/api/children?q=Aiko').read())
for child in r: print(child['name'])
