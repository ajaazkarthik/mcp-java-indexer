# Publishing Quick Reference Card

**Print this or keep it handy!**

---

## 🎯 Your Extension

```
Name:        Java Indexer MCP
Description: IntelliJ-style Java indexing and call-graph analysis for VS Code
License:     MIT
Repository:  https://github.com/YOUR_USERNAME/java-indexer-mcp
```

---

## ⏱️ Publishing Timeline

| Step | Time | Action |
|------|------|--------|
| 1️⃣ GitHub | 5 min | Create repo, push code |
| 2️⃣ Marketplace | 5 min | Register publisher account, get PAT |
| 3️⃣ Icon | 5 min | Create `media/icon.png` (128x128) |
| 4️⃣ Update | 2 min | Update publisher ID in `package.json` |
| 5️⃣ Publish | 2 min | Run `vsce publish` |
| ✅ Live | 10 min | Extension appears in marketplace |

**Total: ~30 minutes**

---

## 🚀 Publish Command (One-Liner)

```powershell
npm run compile; vsce package; vsce login; vsce publish
```

Or step by step:

```powershell
# 1. Compile TypeScript
npm run compile

# 2. Create extension package
vsce package

# 3. Authenticate (paste PAT when prompted)
vsce login

# 4. Publish to marketplace
vsce publish
```

---

## 🔑 Get Your Publisher ID

1. Go: https://marketplace.visualstudio.com/manage/
2. Click: "Create publisher"
3. Enter: Your username (lowercase, no spaces)
4. Note: This becomes your extension ID prefix
   - Example: `yourusername.java-indexer-mcp`

---

## 🔐 Get Your Personal Access Token (PAT)

1. Go: https://dev.azure.com/
2. Click: User settings (⚙️ icon, top right)
3. Select: "Personal access tokens"
4. Click: "New Token"
5. Configure:
   - Name: `vsce-publish`
   - Organization: "All accessible organizations"
   - Scopes: Select "Marketplace" → Check "Publish"
6. Click: "Create"
7. **Copy** the token immediately (can't view again!)

---

## 🎨 Icon Requirements

Create `media/icon.png`:
- **Size**: 128 × 128 pixels
- **Format**: PNG with transparency
- **Style**: Blue background + white "J" (or your design)
- **Location**: `media/icon.png` in project root

---

## 📝 Update package.json

```json
{
  "publisher": "yourusername",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "homepage": "https://github.com/yourusername/java-indexer-mcp",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/java-indexer-mcp.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/java-indexer-mcp/issues"
  }
}
```

---

## ✅ Pre-Publish Checklist

- [ ] GitHub repo created and pushed
- [ ] Marketplace publisher account registered
- [ ] PAT generated and saved securely
- [ ] Publisher ID set in package.json
- [ ] Author information updated
- [ ] Repository URL updated
- [ ] Icon created: `media/icon.png` (128x128)
- [ ] `npm run compile` succeeds
- [ ] `vsce package` creates VSIX file
- [ ] Version in package.json is correct (1.0.0)

---

## 📊 What Gets Published

| Item | Size | Status |
|------|------|--------|
| TypeScript server | 500 KB | ✓ Compiled |
| Java JAR (indexed) | 6.3 MB | ✓ Bundled |
| Extension files | 200 KB | ✓ Ready |
| Documentation | 500 KB | ✓ Complete |
| **Total VSIX** | ~10-15 MB | ✓ Ready |

---

## 🆘 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| "vsce not found" | `npm install -g @vscode/vsce` |
| "Authentication failed" | Regenerate PAT, check expiration |
| "Icon not found" | Create `media/icon.png` (128x128) |
| "Publisher not found" | Register at marketplace, update package.json |
| "Compilation failed" | Run `npm install` first |

---

## 📱 After Publishing

✅ **Marketplace listing live** (usually within 10 minutes)  
✅ **Users can search**: "java indexer mcp"  
✅ **One-click install**: Available for all VS Code users  
✅ **Updates**: Click "Update" button for new versions  

---

## 🔄 Future Updates

To release version 1.0.1:

```powershell
# Update version
npm version patch    # 1.0.0 → 1.0.1

# Update CHANGELOG.md
# Then:
npm run compile
vsce package
vsce publish
```

---

## 📚 Full Documentation

| File | Use Case |
|------|----------|
| `PUBLISH_GUIDE.md` | Detailed publishing instructions |
| `PUBLISHING_SUMMARY.md` | Complete overview |
| `README.md` | User documentation |
| `CHANGELOG.md` | Version history |
| `QUICKSTART.md` | Getting started |

---

## 🎯 Success Metrics

After publishing, track:
- **Downloads**: Check marketplace stats
- **Reviews**: Read user feedback
- **Issues**: Monitor GitHub issues
- **Stars**: GitHub repository stars

---

## 💡 Pro Tips

1. **Backup your PAT** - You can't retrieve it later
2. **Use semantic versioning** - 1.0.0, 1.1.0, 2.0.0
3. **Test locally first** - Install VSIX locally to test
4. **Update README** - Keep documentation current
5. **Respond to users** - Check GitHub issues weekly
6. **Plan releases** - Document version roadmap

---

## 🚀 Ready?

```powershell
# One final check
Test-Path "media/icon.png"              # Should be True
Test-Path "dist/extension.js"           # Should be True
Test-Path "server/dist/index.js"        # Should be True
Test-Path "java-indexer/target/*.jar"   # Should be True

# Then publish!
npm run compile
vsce package
vsce login
vsce publish
```

---

## 📞 Support Links

- **Marketplace**: https://marketplace.visualstudio.com/
- **Publishing Guide**: https://code.visualstudio.com/docs/editor/publish-extension
- **MCP Protocol**: https://modelcontextprotocol.io/
- **GitHub**: https://github.com

---

**Happy Publishing! 🎉**

*Keep this handy for reference during the publishing process.*
