import { Icon } from '@iconify/react';

function Header({
  activeTab,
  setActiveTab,
  currentSVG,
  showSidebar,
  setShowSidebar,
  showRightPanel,
  setShowRightPanel,
  setShowIconLibrary,
  setShowHelp,
  setShowAuth,
  user,
  onLogout,
}) {
  return (
    <header className="gradient-header shadow-sm z-20">
      {/* Single row header */}
      <div className="px-4 py-2 flex items-center justify-between">
        {/* Logo + Tabs */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Icon icon="mdi:vector-square" className="w-6 h-6" />
            <span className="text-base font-semibold">idegy</span>
          </div>

          {/* Tab Navigation - inline */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                activeTab === 'upload'
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon icon="mdi:upload" className="w-3.5 h-3.5 inline mr-1" />
              Upload
            </button>

            <button
              onClick={() => setActiveTab('editor')}
              disabled={!currentSVG}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                activeTab === 'editor'
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon icon="mdi:draw" className="w-3.5 h-3.5 inline mr-1" />
              Editor
            </button>

            <button
              onClick={() => setActiveTab('batch')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                activeTab === 'batch'
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon icon="mdi:image-multiple" className="w-3.5 h-3.5 inline mr-1" />
              Batch
            </button>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowIconLibrary(true)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/80 hover:text-white"
            title="Icon Library"
          >
            <Icon icon="mdi:shape" className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-1.5 rounded transition-colors ${showSidebar ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80 hover:text-white'}`}
            title="Toggle Sidebar"
          >
            <Icon icon="mdi:dock-left" className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={`p-1.5 rounded transition-colors ${showRightPanel ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80 hover:text-white'}`}
            title="Toggle Right Panel"
          >
            <Icon icon="mdi:dock-right" className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/20 mx-1" />

          <button
            onClick={() => setShowHelp(true)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/80 hover:text-white"
            title="Help"
          >
            <Icon icon="mdi:help-circle-outline" className="w-4 h-4" />
          </button>

          {user ? (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-xs text-white/70 max-w-[100px] truncate">{user.name || user.email}</span>
              <button
                onClick={onLogout}
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/80 hover:text-white"
                title="Logout"
              >
                <Icon icon="mdi:logout" className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="px-2.5 py-1 text-xs bg-white/15 hover:bg-white/25 rounded transition-colors font-medium ml-1"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
