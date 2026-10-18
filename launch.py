import sys

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--bundle-check":
        from trackgroups.bundle_check import run
        run(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "--steam-worker":
        from trackgroups.worker import run
        run(sys.argv[2])
    elif len(sys.argv)==3 and sys.argv[1]=="--quick-worker":
        from trackgroups.native_quick import run
        run(sys.argv[2])
    else:
        from trackgroups.app import main
        main()
