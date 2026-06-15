Component({
  properties: {
    role: {
      type: String,
      value: "student",
    },
    current: {
      type: String,
      value: "",
    },
  },

  data: {
    navItems: [],
  },

  observers: {
    "role,current": function () {
      this.updateNavItems();
    },
  },

  lifetimes: {
    attached() {
      this.updateNavItems();
    },
  },

  methods: {
    updateNavItems() {
      const isAdmin = this.properties.role === "admin";
      const navItems = isAdmin
        ? [
            {
              key: "review",
              label: "待审核",
              icon: "✅",
              path: "/pages/admin/review/review",
            },
            {
              key: "records",
              label: "记录",
              icon: "📋",
              path: "/pages/admin/records/records",
            },
            {
              key: "dispatch",
              label: "派发",
              icon: "🚀",
              path: "/pages/admin/dispatch/dispatch",
            },
          ]
        : [
            {
              key: "tasks",
              label: "任务",
              icon: "🧾",
              path: "/pages/student/tasks/tasks",
            },
            {
              key: "history",
              label: "记录",
              icon: "📋",
              path: "/pages/student/history/history",
            },
          ];
      this.setData({ navItems: navItems });
    },

    onNavTap(e) {
      const key = e.currentTarget.dataset.key;
      const path = e.currentTarget.dataset.path;
      if (!path || key === this.properties.current) {
        return;
      }
      wx.redirectTo({ url: path });
    },
  },
});
